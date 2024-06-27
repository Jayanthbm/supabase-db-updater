-- CREATE TABLE transactions (
--     id SERIAL PRIMARY KEY,
--     date_iso TIMESTAMPTZ NOT NULL,
--     date TEXT,
--     account TEXT,
--     category TEXT,
--     subcategory TEXT,
--     amount NUMERIC,
--     currency TEXT,
--     converted_amount_inr NUMERIC,
--     type TEXT,
--     person_company TEXT,
--     description TEXT
-- );

BEGIN;

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    date_iso TIMESTAMPTZ NOT NULL,
    date TEXT,
    account TEXT,
    category TEXT,
    subcategory TEXT,
    amount NUMERIC,
    currency TEXT,
    converted_amount_inr NUMERIC,
    type TEXT,
    person_company TEXT,
    description TEXT,
    formatted_date DATE
);

-- Add a unique constraint to ensure no duplicate transactions
ALTER TABLE transactions
ADD CONSTRAINT unique_transaction
UNIQUE (date_iso, account, category, subcategory, type, person_company);
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE transactiontags (
    transaction_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (transaction_id, tag_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_transaction_id ON transactiontags(transaction_id);
CREATE INDEX idx_tag_id ON transactiontags(tag_id);

CREATE TABLE category (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(7) CHECK (type IN ('Expense', 'Income')) NOT NULL,
    CONSTRAINT unique_name_type UNIQUE (name, type)
);

CREATE TABLE payee (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE uploads (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Step 1: Drop the existing uploads table
DROP TABLE IF EXISTS uploads;

-- Step 2: Create the new uploads table with the updated structure
CREATE TABLE uploads (
    id SERIAL PRIMARY KEY,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_uploaded_at UNIQUE (uploaded_at)
);


COMMIT;
