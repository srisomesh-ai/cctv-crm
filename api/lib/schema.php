<?php
// Database tables. install.php runs these (CREATE TABLE IF NOT EXISTS — safe to run again).
declare(strict_types=1);

const SCHEMA = [
"CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(20) NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'technician',      -- admin | manager | sales | technician
  password_hash VARCHAR(255) NOT NULL,
  color VARCHAR(9) NOT NULL DEFAULT '#2563eb',
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(60) PRIMARY KEY,
  v TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS login_fails (
  k VARCHAR(120) PRIMARY KEY,
  n INT NOT NULL,
  until_ts INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  company VARCHAR(160) NULL,
  phone VARCHAR(20) NULL,
  alt_phone VARCHAR(20) NULL,
  email VARCHAR(190) NULL,
  address TEXT NULL,
  city VARCHAR(80) NULL,
  pincode VARCHAR(10) NULL,
  gstin VARCHAR(20) NULL,
  category VARCHAR(30) NULL,                            -- home | shop | office | school | hospital | apartment | factory | other
  source VARCHAR(30) NULL,
  notes TEXT NULL,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (phone), INDEX (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  company VARCHAR(160) NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(190) NULL,
  address TEXT NULL,
  city VARCHAR(80) NULL,
  requirement TEXT NULL,
  property_type VARCHAR(30) NULL,
  cameras INT NULL,
  value DECIMAL(12,2) NULL,                             -- expected deal value
  source VARCHAR(30) NULL,                              -- walk-in | phone | whatsapp | website | referral | justdial | indiamart | other
  stage VARCHAR(20) NOT NULL DEFAULT 'new',             -- new | contacted | site_visit | quoted | negotiation | won | lost
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',       -- low | normal | high
  assigned_to INT NULL,
  next_followup DATETIME NULL,
  lost_reason VARCHAR(255) NULL,
  customer_id INT NULL,
  won_at DATETIME NULL,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (stage), INDEX (next_followup), INDEX (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity VARCHAR(20) NOT NULL,                          -- lead | customer | job | doc | amc
  entity_id INT NOT NULL,
  user_id INT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'note',             -- note | call | whatsapp | visit | email | status | system
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(40) NULL,
  name VARCHAR(190) NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'camera',       -- camera | dvr | nvr | hdd | cable | power | network | accessory | service
  brand VARCHAR(60) NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst DECIMAL(5,2) NOT NULL DEFAULT 18,
  hsn VARCHAR(20) NULL,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  warranty_months INT NULL,
  track_stock TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS stock_moves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  qty INT NOT NULL,                                     -- + in, - out
  kind VARCHAR(20) NOT NULL,                            -- purchase | job | adjust | return | invoice
  ref VARCHAR(60) NULL,
  note VARCHAR(255) NULL,
  user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS docs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(10) NOT NULL,                            -- quote | invoice
  number VARCHAR(40) NOT NULL,
  customer_id INT NULL,
  lead_id INT NULL,
  job_id INT NULL,
  from_doc_id INT NULL,                                 -- invoice made from this quote
  title VARCHAR(190) NULL,
  date DATE NOT NULL,
  due_date DATE NULL,                                   -- quote: valid till · invoice: due date
  status VARCHAR(20) NOT NULL DEFAULT 'draft',          -- quote: draft|sent|accepted|rejected · invoice: unpaid|partial|paid|cancelled
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  terms TEXT NULL,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (type, number), INDEX (customer_id), INDEX (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS doc_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  product_id INT NULL,
  description VARCHAR(255) NOT NULL,
  hsn VARCHAR(20) NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit VARCHAR(20) NULL,
  rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst DECIMAL(5,2) NOT NULL DEFAULT 18,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  INDEX (doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NULL,
  customer_id INT NULL,
  job_id INT NULL,
  amount DECIMAL(12,2) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'cash',             -- cash | upi | bank | card | cheque
  ref VARCHAR(80) NULL,
  paid_on DATE NOT NULL,
  received_by INT NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (doc_id), INDEX (paid_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(40) NOT NULL UNIQUE,
  type VARCHAR(20) NOT NULL DEFAULT 'installation',     -- installation | complaint | service | amc_visit | survey
  title VARCHAR(190) NOT NULL,
  customer_id INT NULL,
  address TEXT NULL,
  contact_phone VARCHAR(20) NULL,
  description TEXT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',       -- low | normal | high | urgent
  status VARCHAR(20) NOT NULL DEFAULT 'new',            -- new | scheduled | in_progress | on_hold | completed | cancelled
  scheduled_at DATETIME NULL,
  assigned_to INT NULL,
  amc_id INT NULL,
  doc_id INT NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  resolution TEXT NULL,
  charge DECIMAL(12,2) NOT NULL DEFAULT 0,
  collected DECIMAL(12,2) NOT NULL DEFAULT 0,
  rating TINYINT NULL,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (status), INDEX (assigned_to), INDEX (scheduled_at), INDEX (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS job_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  product_id INT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS amc (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(40) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  title VARCHAR(190) NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  visits INT NOT NULL DEFAULT 4,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  cameras INT NULL,
  covers TEXT NULL,
  notes TEXT NULL,
  renewed_to INT NULL,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity VARCHAR(20) NOT NULL,
  entity_id INT NOT NULL,
  path VARCHAR(255) NOT NULL,
  name VARCHAR(190) NOT NULL,
  mime VARCHAR(80) NULL,
  size INT NULL,
  user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

const DATA_TABLES = ['customers', 'leads', 'activities', 'products', 'stock_moves', 'docs', 'doc_items', 'payments', 'jobs', 'job_items', 'amc', 'files'];

function install_schema(): void { foreach (SCHEMA as $sql) db()->exec($sql); }
