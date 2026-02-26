# Space X KB Private Bank

A production-grade investment broker and digital private banking platform built with enterprise-level architecture, financial-grade security, and luxury UX design.

## Overview

Space X KB Private Bank is a comprehensive fintech platform demonstrating:
- **Double-entry accounting** for all transactions
- **Multi-currency support** (USD, USDT, BTC, ETH)
- **Investment/broker module** with paper trading
- **Card management** with virtual cards
- **Loan system** with amortization
- **Real-time support chat**
- **Admin dashboard** with full CRUD

## Tech Stack

### Frontend
- **Framework**: React + TypeScript + Vite
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: shadcn/ui (40+ components)
- **Charts**: Recharts
- **State**: React hooks
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20+ LTS
- **Framework**: Express.js with modular architecture
- **Database**: PostgreSQL 15+ with Prisma ORM
- **Authentication**: JWT (access + refresh tokens)
- **Real-time**: Socket.io
- **Email**: Nodemailer (Gmail SMTP)
- **Security**: Helmet, Rate-limiting, CORS, CSRF tokens

## Project Structure

```
spacex-kb-bank/
├── frontend/                 # Next.js React Application
│   ├── src/
│   │   ├── App.tsx          # Main application component
│   │   ├── index.css        # Global styles & design system
│   │   └── components/ui/   # shadcn/ui components
│   └── dist/                # Build output
│
├── backend/                  # Node.js/Express API
│   ├── src/
│   │   ├── app.js           # Express server setup
│   │   ├── config/          # Database, Redis, Email config
│   │   ├── controllers/     # Route controllers
│   │   ├── middleware/      # Auth, RBAC, Validation
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   └── utils/           # Helpers, encryption
│   └── prisma/
│       └── schema.prisma    # Database schema
│
└── README.md
```

## Features

### Authentication & Security
- JWT-based authentication with access & refresh tokens
- Password hashing with bcrypt (cost factor 12)
- Rate limiting (5 attempts per 15 min per IP)
- Session tracking (IP, user-agent)
- Email notifications on login

### Banking Core
- **Multi-currency accounts**: USD, USDT, BTC, ETH
- **Double-entry ledger**: All transactions follow accounting principles
- **Transfer system**: Internal transfers between accounts
- **Deposit methods**: Crypto, PayPal, CashApp, Bank Transfer, Gift Cards
- **Withdrawal system**: To external wallets/accounts

### Card Management
- Virtual card generation
- Card freezing/unfreezing
- Spending limits (daily/monthly)
- CVV encryption
- Transaction history

### Investment Module
- Paper trading for stocks & crypto
- Real-time price simulation
- Portfolio tracking
- P&L calculation (realized/unrealized)
- Asset watchlist

### Loan System
- Loan applications
- Amortization schedule
- Payment tracking
- Interest calculation

### Support System
- Real-time chat with Socket.io
- Message history
- File attachments
- Admin support queue

### Admin Dashboard
- User management (freeze/unfreeze)
- Balance adjustments with audit trail
- Transaction monitoring
- Ledger verification
- Support ticket management

## Database Schema

### Core Models
- **User**: Authentication & profile
- **Account**: Multi-currency accounts
- **Balance**: Account balances
- **LedgerEntry**: Double-entry bookkeeping
- **Transaction**: All financial transactions
- **Card**: Virtual card management
- **Loan**: Loan applications & tracking
- **Asset**: Investment assets
- **Portfolio**: User investment portfolios
- **Position**: Asset holdings
- **SupportMessage**: Chat messages
- **AdminLog**: Audit trail

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Token refresh
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Current user

### Accounts
- `GET /api/v1/accounts` - List accounts
- `GET /api/v1/accounts/:id/balance` - Get balance
- `GET /api/v1/accounts/:id/ledger` - Get ledger
- `POST /api/v1/accounts/transfer` - Internal transfer

### Transactions
- `GET /api/v1/transactions` - List transactions
- `POST /api/v1/transactions/deposit` - Initiate deposit
- `POST /api/v1/transactions/withdraw` - Initiate withdrawal

### Cards
- `GET /api/v1/cards` - List cards
- `POST /api/v1/cards` - Create card
- `PATCH /api/v1/cards/:id/freeze` - Freeze/unfreeze
- `PATCH /api/v1/cards/:id/limits` - Update limits

### Investments
- `GET /api/v1/investments/assets` - List assets
- `GET /api/v1/investments/portfolio` - Get portfolio
- `POST /api/v1/investments/portfolio/buy` - Buy asset
- `POST /api/v1/investments/portfolio/sell` - Sell asset

### Loans
- `GET /api/v1/loans` - List loans
- `POST /api/v1/loans/apply` - Apply for loan
- `POST /api/v1/loans/:id/repay` - Make payment

### Admin
- `GET /api/v1/admin/dashboard` - Dashboard stats
- `GET /api/v1/admin/users` - List users
- `PATCH /api/v1/admin/users/:id/balance` - Adjust balance
- `PATCH /api/v1/admin/users/:id/status` - Freeze/unfreeze
- `GET /api/v1/admin/transactions` - All transactions
- `GET /api/v1/admin/ledger` - Ledger entries

## Environment Variables

### Backend (.env)
```
DATABASE_URL="postgresql://user:pass@localhost:5432/spacex_kb_bank"
JWT_SECRET="your-jwt-secret-min-32-chars"
JWT_REFRESH_SECRET="your-refresh-secret-min-32-chars"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
ENCRYPTION_KEY="aes-256-gcm-key-for-sensitive-data"
REDIS_URL="redis://localhost:6379"
PORT=5000
FRONTEND_URL="http://localhost:3000"
```

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis (optional, for rate limiting)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd spacex-kb-bank
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Set up database**
```bash
npx prisma migrate dev
npx prisma db seed
```

4. **Start backend**
```bash
npm run dev
```

5. **Install frontend dependencies**
```bash
cd ../frontend
npm install
```

6. **Start frontend**
```bash
npm run dev
```

### Default Login Credentials

**Super Admin**
- Email: `admin@spacexkb.bank`
- Password: `SuperSecurePass123!`

**Demo User**
- Email: `demo@spacexkb.bank`
- Password: `DemoPass123!`

## Design System

### Color Palette (Luxury Dark Fintech)
- **Background**: `#0a0a0f`
- **Surface**: `#12121a`
- **Primary**: `#6366f1` (Indigo 500)
- **Accent Gold**: `#f59e0b` (Amber 500)
- **Accent Crypto**: `#10b981` (Emerald 500)
- **Success**: `#22c55e`
- **Warning**: `#f59e0b`
- **Error**: `#ef4444`

### Typography
- **Headings**: Inter, 700 weight
- **Body**: Inter, 400 weight
- **Monospace (balances)**: JetBrains Mono

## Security Features

- **Data Encryption**: AES-256-GCM for sensitive fields
- **Password Hashing**: Bcrypt with salt
- **JWT Tokens**: Short-lived access tokens (15 min)
- **Rate Limiting**: Redis-based sliding window
- **CORS**: Configured for frontend origin
- **Helmet**: Security headers
- **Input Validation**: Joi/Zod schemas
- **SQL Injection Protection**: Parameterized queries via Prisma

## License

MIT License - See LICENSE file for details

## Support

For support, email support@spacexkb.bank or use the in-app chat feature.

---

Built with precision. Designed for excellence. Space X KB Private Bank.
