const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const csv = require("csv-parser");
const dotenv = require("dotenv");
dotenv.config();

// Supabase credentials
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Define ANSI escape sequences for colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

// Function to log progress
const logProgress = (message) => {
  console.log(colors.cyan + message + colors.reset);
};

// Function to log errors in red
const logError = (message) => {
  console.error(colors.red + message + colors.reset);
};

// Function to log success in green
const logSuccess = (message) => {
  console.log(colors.green + message + colors.reset);
};

// Upsert record into transactions table
async function upsertRecord(record, tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .upsert(record, {
        onConflict: [
          "date_iso",
          "account",
          "category",
          "subcategory",
          "type",
          "person_company",
        ],
      })
      .select();

    if (error) {
      logError(`Error upserting record: ${error.message}`);
      return null;
    }

    return data && data.length > 0 ? data[0].id : null;
  } catch (error) {
    logError(`Error upserting record: ${error.message}`);
    return null;
  }
}

// Upsert tag into Tags table and return tag IDs
async function upsertTag(tags) {
  try {
    const tagIds = [];
    for (const tag of tags) {
      const { data, error } = await supabase
        .from("tags")
        .upsert({ name: tag }, { onConflict: ["name"] })
        .select();

      if (error) {
        logError(`Error upserting tag '${tag}': ${error.message}`);
      } else {
        if (data && data.length > 0) {
          tagIds.push(data[0].id);
        }
      }
    }
    return tagIds;
  } catch (error) {
    logError(`Error creating tags: ${error.message}`);
    return [];
  }
}

// Insert association into TransactionTags table
async function upsertTransactionTags(transactionId, tagIds) {
  try {
    const transactionTags = tagIds.map((tagId) => ({
      transaction_id: transactionId,
      tag_id: tagId,
    }));
    const { data, error } = await supabase
      .from("transactiontags")
      .upsert(transactionTags, {
        onConflict: ["transaction_id", "tag_id"],
      })
      .select();

    if (error) {
      logError(`Error upserting transaction tags: ${error.message}`);
    }
  } catch (error) {
    logError(`Error creating transaction tags: ${error.message}`);
  }
}

// Generate tags from the description
const generateTags = (description) => {
  try {
    let tags = description.split(" ").filter((tag) => tag.startsWith("#"));

    // Retain only alphanumeric characters and underscores
    tags = tags.map((tag) => tag.replace(/[^a-zA-Z0-9_]/g, ""));

    // Remove duplicate tags
    tags = Array.from(new Set(tags));
    return tags;
  } catch (error) {
    logError(`Error generating tags: ${error.message}`);
    return [];
  }
};

const upsertCategory = async (category, type) => {
  try {
    const { data, error } = await supabase
      .from("category")
      .upsert(
        { name: category, type: type },
        {
          onConflict: ["name", "type"],
        },
      )
      .select();

    if (error) {
      console.error("Error upserting category:", error);
      return null;
    }
    return data && data.length > 0 ? data[0].id : null;
  } catch (error) {
    logError(`Error upserting category '${category}': ${error.message}`);
    return null;
  }
};

const upsertPayee = async (payeeName) => {
  try {
    const { data, error } = await supabase
      .from("payee")
      .upsert(
        { name: payeeName },
        {
          onConflict: ["name"],
        },
      )
      .select();

    if (error) {
      logError(`Error upserting payee '${payeeName}': ${error.message}`);
      return null;
    }

    return data && data.length > 0 ? data[0].id : null;
  } catch (error) {
    logError(`Unexpected error upserting payee: ${error.message}`);
    return null;
  }
};

async function getLastUploadDate() {
  try {
    const { data, error } = await supabase
      .from("uploads")
      .select("uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(1);

    if (error) {
      logError(`Error fetching last upload date: ${error.message}`);
      return null;
    }

    if (data && data.length > 0) {
      return new Date(data[0].uploaded_at);
    } else {
      logProgress("No previous uploads found.");
      return null;
    }
  } catch (error) {
    logError(`Unexpected error fetching last upload date: ${error.message}`);
    return null;
  }
}

function shouldUploadRecord(recordDate, lastUploadDate) {
  if (!lastUploadDate) {
    // If there is no last upload date, upload all records
    return true;
  }

  // Create Date objects
  const recordDateObj = new Date(recordDate);
  const lastUploadDateObj = new Date(lastUploadDate);

  // Strip time part by setting time to 00:00:00
  recordDateObj.setUTCHours(0, 0, 0, 0);
  lastUploadDateObj.setUTCHours(0, 0, 0, 0);

  // Compare the record date to the last upload date
  return recordDateObj >= lastUploadDateObj;
}

// Record the successful upload

async function updateUploads(lastRecordDate) {
  try {
    await supabase
      .from("uploads")
      .upsert(
        { uploaded_at: lastRecordDate },
        {
          onConflict: ["uploaded_at"],
        },
      )
      .select();
    logSuccess(`Updated uploads with date '${lastRecordDate}'`);
  } catch (error) {
    logError(`Error updating uploads: ${error.message}`);
  }
}

async function handleRecord(record, tableName) {
  try {
    const transactionId = await upsertRecord(record, tableName);
    if (transactionId) {
      const tags = generateTags(record["description"]);
      if (tags && tags.length > 0) {
        const tagIds = await upsertTag(tags);
        await upsertTransactionTags(transactionId, tagIds);
      }
    }
    const category = record["category"];
    const type = record["type"];
    if (category && type) {
      await upsertCategory(category, type);
    }
    const payeeName = record["person_company"];
    if (payeeName && payeeName.trim().length > 0) {
      await upsertPayee(payeeName);
    }
  } catch (error) {
    logError(`Error upserting record: ${error.message}`);
  }
}

const formatDate = (dateString) => {
  // Split the dateString into date and time parts
  const [datePart, timePart] = dateString.split(", ");

  // Split the datePart into day, month, and year
  const [day, month, yearShort] = datePart.split("/");

  // Convert the two-digit year to four digits
  const year = `20${yearShort}`;

  // Convert the timePart from AM/PM to 24-hour format
  let [time, period] = timePart.split(" ");
  let [hours, minutes] = time.split(":");

  if (period === "PM") {
    hours = parseInt(hours, 10);
    if (hours !== 12) {
      hours += 12;
    }
  } else if (period === "AM" && hours === "12") {
    hours = "00";
  }

  // Construct the formatted date string in YYYY-MM-DD format
  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
};
// Upload and process CSV
async function uploadCSV(filePath, tableName, force = false) {
  return new Promise((resolve, reject) => {
    const records = [];
    getLastUploadDate()
      .then((lastUploadDate) => {
        fs.createReadStream(filePath)
          .pipe(csv({ separator: ";" }))
          .on("data", (data) => {
            records.push({
              date_iso: data["Date (ISO 8601)"],
              date: data["Date"],
              account: data["Account"],
              category: data["Category"],
              subcategory: data["Subcategory"],
              amount: parseFloat(data["Amount"].replace(/,/g, "")),
              currency: data["Currency"],
              converted_amount_inr: parseFloat(
                data["Converted amount (INR)"].replace(/,/g, ""),
              ),
              type: data["Type"],
              person_company: data["Person / Company"],
              description: data["Description"],
              formatted_date: formatDate(data["Date"]),
            });
          })
          .on("end", async () => {
            let successCount = 0;
            let errorCount = 0;

            logProgress(`Found ${records.length} records in the CSV file.`);
            const lastRecordDate =
              records.length > 0 ? records[records.length - 1].date_iso : null;
            for (const [index, record] of records.entries()) {
              if (
                shouldUploadRecord(record.date_iso, lastUploadDate) ||
                force
              ) {
                try {
                  await handleRecord(record, tableName);
                  successCount++;
                  logProgress(
                    `Processed record ${index + 1}/${records.length}`,
                  );
                } catch (error) {
                  errorCount++;
                  logError(`Error processing record: ${error.message}`);
                }
              }
            }

            logSuccess(`Uploaded ${successCount} records successfully.`);
            if (errorCount > 0) {
              logError(`Failed to upload ${errorCount} records.`);
            }

            await updateUploads(lastRecordDate);
            resolve();
          })
          .on("error", (error) => {
            logError(`Error reading CSV file: ${error.message}`);
            reject(error);
          });
      })
      .catch((error) => {
        logError(`Error getting last upload date: ${error.message}`);
        reject(error);
      });
  });
}

// Usage
(async () => {
  const filePath = "./import.csv";
  const tableName = "transactions";
  try {
    await uploadCSV(filePath, tableName);
    logSuccess("CSV processing complete.");
  } catch (error) {
    logError(`Error during CSV processing: ${error.message}`);
  } finally {
    process.exit(0); // Exit the process
  }
})();
