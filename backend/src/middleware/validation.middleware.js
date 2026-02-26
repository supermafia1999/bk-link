const { validationResult, body, param, query } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Auth validations
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 12 })
    .withMessage('Password must be at least 12 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('Password must contain special character'),
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be 2-100 characters'),
  handleValidationErrors
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Transaction validations
const depositValidation = [
  body('accountId')
    .isUUID()
    .withMessage('Valid account ID is required'),
  body('amount')
    .isDecimal({ min: 0.01 })
    .withMessage('Amount must be at least 0.01'),
  body('method')
    .isIn(['CRYPTO', 'PAYPAL', 'CASHAPP', 'BANK_TRANSFER', 'GIFT_CARD'])
    .withMessage('Valid deposit method is required'),
  handleValidationErrors
];

const transferValidation = [
  body('fromAccountId')
    .isUUID()
    .withMessage('Valid source account ID is required'),
  body('toAccountNumber')
    .notEmpty()
    .withMessage('Destination account number is required'),
  body('amount')
    .isDecimal({ min: 0.01 })
    .withMessage('Amount must be at least 0.01'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must be under 255 characters'),
  handleValidationErrors
];

// Card validations
const cardLimitValidation = [
  body('dailyLimit')
    .optional()
    .isDecimal({ min: 0 })
    .withMessage('Daily limit must be positive'),
  body('monthlyLimit')
    .optional()
    .isDecimal({ min: 0 })
    .withMessage('Monthly limit must be positive'),
  handleValidationErrors
];

// Loan validations
const loanApplicationValidation = [
  body('amount')
    .isDecimal({ min: 100 })
    .withMessage('Loan amount must be at least 100'),
  body('termMonths')
    .isInt({ min: 3, max: 60 })
    .withMessage('Term must be 3-60 months'),
  body('purpose')
    .optional()
    .trim()
    .isLength({ max: 500 }),
  handleValidationErrors
];

// Investment validations
const tradeValidation = [
  body('assetId')
    .isUUID()
    .withMessage('Valid asset ID is required'),
  body('quantity')
    .isDecimal({ min: 0.0001 })
    .withMessage('Quantity must be at least 0.0001'),
  handleValidationErrors
];

// Admin validations
const balanceAdjustmentValidation = [
  body('amount')
    .isDecimal()
    .withMessage('Valid amount is required'),
  body('reason')
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Reason must be 5-500 characters'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  registerValidation,
  loginValidation,
  depositValidation,
  transferValidation,
  cardLimitValidation,
  loanApplicationValidation,
  tradeValidation,
  balanceAdjustmentValidation,
  body,
  param,
  query
};
