import sql from 'mssql';
import { DateTime } from 'luxon';

const REQUIRED_ENV = [
  'SHOPLINE_TOKEN',
  'SQL_SERVER',
  'SQL_DATABASE',
  'SQL_USER',
  'SQL_PASSWORD',
];

const CUSTOMER_FIELDS = [
  'items.id',
  'items.name',
  'items.mobile_phone',
  'items.mobile_phone_verified',
  'items.email',
  'items.line_id',
  'items.custom_data',
  'items.tags',
  'items.memo',
];

function requireEnvironment() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required secret(s): ${missing.join(', ')}`);
  }
}

function envBoolean(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

function updatedAfter() {
  return DateTime.utc().minus({ minutes: 30 }).toFormat('yyyy-MM-dd HH:mm:ss');
}

async function fetchCustomers() {
  const url = new URL('https://open.shopline.io/v1/customers');
  url.searchParams.set('per_page', '999');
  url.searchParams.set('page', '1');
  url.searchParams.set('updated_after', updatedAfter());
  CUSTOMER_FIELDS.forEach((field) => url.searchParams.append('fields[]', field));

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.SHOPLINE_TOKEN}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `SHOPLINE customers request failed: HTTP ${response.status} ${response.statusText} ${text.slice(0, 300)}`,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data.items)) {
    throw new Error('SHOPLINE customers response does not contain an items array.');
  }

  return data.items;
}

async function updateCustomers(customers) {
  const port = Number.parseInt(process.env.SQL_PORT ?? '1433', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SQL_PORT must be an integer from 1 to 65535.');
  }

  const pool = await sql.connect({
    server: process.env.SQL_SERVER,
    port,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: envBoolean('SQL_ENCRYPT', true),
      trustServerCertificate: envBoolean('SQL_TRUST_SERVER_CERTIFICATE', false),
    },
  });

  try {
    await pool.request()
      .input('customersJson', sql.NVarChar(sql.MAX), JSON.stringify(customers))
      .query('EXEC [更新客戶] @customersJson');
  } finally {
    await pool.close();
  }
}

async function main() {
  requireEnvironment();
  const customers = await fetchCustomers();
  console.log(`Fetched ${customers.length} updated customer(s) from SHOPLINE.`);
  await updateCustomers(customers);
  console.log('Customer update stored procedure completed successfully.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
