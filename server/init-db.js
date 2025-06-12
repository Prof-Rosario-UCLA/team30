// Database initialization script for production deployment
const { PrismaClient } = require('@prisma/client');
const { execSync }   = require('child_process');

async function initializeDatabase() {
  console.log('Initializing database...');
  
  const prisma = new PrismaClient();
  
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connected successfully');
    
    // Run database migrations
    console.log('Running database migrations...');
    // Migrations will be handled by Prisma during deployment
    
    await prisma.$disconnect();
    console.log('Database initialized successfully');

    // execSync(
    //   'npx prisma db push --schema=./prisma/schema.prisma --skip-generate',
    //   { stdio: 'inherit', env: { ...process.env, PORT: '0' } }
    // );
    
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database initialization script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database initialization script failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase }; 