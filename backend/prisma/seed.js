const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { Decimal } = require('decimal.js');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Create Super Admin
  const adminPassword = await bcrypt.hash('SuperSecurePass123!', 12);
  
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@spacexkb.bank' },
    update: {},
    create: {
      email: 'admin@spacexkb.bank',
      passwordHash: adminPassword,
      fullName: 'System Administrator',
      role: 'SUPER_ADMIN',
      emailVerified: true,
      accounts: {
        create: [
          { 
            type: 'USD', 
            accountNumber: 'USD-SYSTEM-001',
            balances: {
              create: {
                available: 999999999.99
              }
            }
          },
          { 
            type: 'USDT', 
            accountNumber: 'USDT-SYSTEM-001',
            balances: {
              create: {
                available: 999999999.99
              }
            }
          },
          { 
            type: 'BTC', 
            accountNumber: 'BTC-SYSTEM-001',
            balances: {
              create: {
                available: 999999.99999999
              }
            }
          },
          { 
            type: 'ETH', 
            accountNumber: 'ETH-SYSTEM-001',
            balances: {
              create: {
                available: 999999.99999999
              }
            }
          },
        ]
      },
      profile: {
        create: {
          kycStatus: 'verified'
        }
      }
    }
  });

  console.log('✅ Super Admin created:', superAdmin.email);

  // Create sample assets
  const assets = [
    { symbol: 'AAPL', name: 'Apple Inc.', type: 'STOCK', category: 'TECH', currentPrice: 195.50, dayChange: 1.25 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'STOCK', category: 'TECH', currentPrice: 420.75, dayChange: 0.85 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'STOCK', category: 'TECH', currentPrice: 175.20, dayChange: -0.45 },
    { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'STOCK', category: 'AUTO', currentPrice: 245.60, dayChange: 2.10 },
    { symbol: 'BTC', name: 'Bitcoin', type: 'CRYPTO', category: 'CRYPTO', currentPrice: 67500.00, dayChange: 3.50 },
    { symbol: 'ETH', name: 'Ethereum', type: 'CRYPTO', category: 'CRYPTO', currentPrice: 3550.00, dayChange: 2.80 },
    { symbol: 'SOL', name: 'Solana', type: 'CRYPTO', category: 'CRYPTO', currentPrice: 145.30, dayChange: 5.20 },
    { symbol: 'ADA', name: 'Cardano', type: 'CRYPTO', category: 'CRYPTO', currentPrice: 0.58, dayChange: 1.50 },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'ETF', category: 'INDEX', currentPrice: 595.40, dayChange: 0.65 },
    { symbol: 'QQQ', name: 'Invesco QQQ ETF', type: 'ETF', category: 'INDEX', currentPrice: 515.25, dayChange: 0.90 },
  ];

  for (const asset of assets) {
    await prisma.asset.upsert({
      where: { symbol: asset.symbol },
      update: {},
      create: {
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        category: asset.category,
        currentPrice: new Decimal(asset.currentPrice),
        dayChange: new Decimal(asset.dayChange)
      }
    });
  }

  console.log(`✅ ${assets.length} assets created`);

  // Create demo user
  const demoPassword = await bcrypt.hash('DemoPass123!', 12);
  
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@spacexkb.bank' },
    update: {},
    create: {
      email: 'demo@spacexkb.bank',
      passwordHash: demoPassword,
      fullName: 'Demo User',
      role: 'USER',
      emailVerified: true,
      accounts: {
        create: [
          { 
            type: 'USD', 
            accountNumber: 'USD-DEMO-001',
            balances: {
              create: {
                available: 50000.00
              }
            }
          },
          { 
            type: 'USDT', 
            accountNumber: 'USDT-DEMO-001',
            balances: {
              create: {
                available: 25000.00
              }
            }
          },
          { 
            type: 'BTC', 
            accountNumber: 'BTC-DEMO-001',
            balances: {
              create: {
                available: 0.5
              }
            }
          },
          { 
            type: 'ETH', 
            accountNumber: 'ETH-DEMO-001',
            balances: {
              create: {
                available: 5.0
              }
            }
          },
        ]
      },
      profile: {
        create: {
          phone: '+1 (555) 123-4567',
          kycStatus: 'verified'
        }
      }
    },
    include: {
      accounts: true
    }
  });

  console.log('✅ Demo User created:', demoUser.email);

  // Create portfolio for demo user
  await prisma.portfolio.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      totalValue: 0,
      totalCost: 0,
      unrealizedPnL: 0
    }
  });

  // Create sample transactions for demo user
  const usdAccount = demoUser.accounts.find(a => a.type === 'USD');
  
  if (usdAccount) {
    const sampleTransactions = [
      {
        userId: demoUser.id,
        accountId: usdAccount.id,
        type: 'DEPOSIT',
        amount: new Decimal(50000),
        currency: 'USD',
        status: 'COMPLETED',
        description: 'Initial deposit',
        processedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      },
      {
        userId: demoUser.id,
        accountId: usdAccount.id,
        type: 'INVESTMENT_BUY',
        amount: new Decimal(10000),
        currency: 'USD',
        status: 'COMPLETED',
        description: 'Buy 0.15 BTC',
        processedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
      },
      {
        userId: demoUser.id,
        accountId: usdAccount.id,
        type: 'CARD_TRANSACTION',
        amount: new Decimal(250.75),
        currency: 'USD',
        status: 'COMPLETED',
        description: 'Grocery Store',
        processedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }
    ];

    for (const tx of sampleTransactions) {
      await prisma.transaction.create({
        data: tx
      });
    }

    console.log(`✅ ${sampleTransactions.length} sample transactions created`);
  }

  console.log('\n🎉 Database seed completed successfully!');
  console.log('\nLogin credentials:');
  console.log('  Super Admin: admin@spacexkb.bank / SuperSecurePass123!');
  console.log('  Demo User:   demo@spacexkb.bank / DemoPass123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
