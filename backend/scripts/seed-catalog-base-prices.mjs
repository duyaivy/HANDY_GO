import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required to run this script');
  process.exit(1);
}

const DEFAULT_SERVICE_PRICE_MAP = [
  { keyword: 'máy lạnh', min: 150000, max: 450000 },
  { keyword: 'điều hòa', min: 150000, max: 450000 },
  { keyword: 'tủ lạnh', min: 150000, max: 500000 },
  { keyword: 'máy giặt', min: 150000, max: 400000 },
  { keyword: 'nước', min: 100000, max: 350000 },
  { keyword: 'điện', min: 100000, max: 350000 },
  { keyword: 'khóa', min: 100000, max: 300000 },
  { keyword: 'vệ sinh', min: 120000, max: 350000 },
  { keyword: 'sơn', min: 200000, max: 800000 },
  { keyword: 'mộc', min: 150000, max: 600000 },
  { keyword: 'nhà', min: 150000, max: 500000 },
];

async function seedCatalogBasePrices() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    console.log('Fetching existing services from catalog_service.services...');
    const res = await client.query(`
      SELECT id, name, base_price_min, base_price_max
      FROM catalog_service.services
    `);

    console.log(`Found ${res.rows.length} services.`);

    let updatedCount = 0;
    for (const service of res.rows) {
      const nameLower = (service.name || '').toLowerCase();
      let matchedConfig = DEFAULT_SERVICE_PRICE_MAP.find((item) =>
        nameLower.includes(item.keyword),
      );

      // Default baseline if no keyword matches: 150,000 - 350,000
      const minPrice = matchedConfig ? matchedConfig.min : 150000;
      const maxPrice = matchedConfig ? matchedConfig.max : 350000;

      // Update if not set or different
      await client.query(
        `
        UPDATE catalog_service.services
        SET base_price_min = COALESCE(base_price_min, $1),
            base_price_max = COALESCE(base_price_max, $2)
        WHERE id = $3
      `,
        [minPrice, maxPrice, service.id],
      );
      updatedCount++;
      console.log(`✓ Updated service [${service.name}] -> min: ${minPrice}, max: ${maxPrice}`);
    }

    console.log(`Successfully ensured base prices for ${updatedCount} services.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seedCatalogBasePrices().catch((err) => {
  console.error('Failed to seed catalog base prices:', err);
  process.exit(1);
});
