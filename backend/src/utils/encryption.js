const crypto = require('crypto');
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'aes-256-gcm-key-for-sensitive-data-32chars';

// AES-256-GCM encryption for sensitive data
const encrypt = (text) => {
  if (!text) return null;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
    iv
  );
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
};

const decrypt = (encryptedData) => {
  if (!encryptedData) return null;
  
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
      iv
    );
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
};

// Hash for lookups (one-way)
const hashForLookup = (data) => {
  return crypto
    .createHmac('sha256', ENCRYPTION_KEY)
    .update(data)
    .digest('hex');
};

// Mask card number (show last 4 digits only)
const maskCardNumber = (cardNumber) => {
  if (!cardNumber || cardNumber.length < 4) return '••••';
  const last4 = cardNumber.slice(-4);
  return '•••• •••• •••• ' + last4;
};

// Generate secure random token
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate account number
const generateAccountNumber = (type) => {
  const prefix = type;
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${random}-${timestamp}`;
};

// Generate card number (Luhn algorithm compliant)
const generateCardNumber = () => {
  const prefix = '4'; // Visa-like
  let number = prefix;
  
  for (let i = 0; i < 14; i++) {
    number += Math.floor(Math.random() * 10);
  }
  
  // Calculate Luhn check digit
  let sum = 0;
  let isEven = false;
  
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return number + checkDigit;
};

// Generate CVV
const generateCVV = () => {
  return Math.floor(100 + Math.random() * 900).toString();
};

module.exports = {
  encrypt,
  decrypt,
  hashForLookup,
  maskCardNumber,
  generateToken,
  generateAccountNumber,
  generateCardNumber,
  generateCVV,
};
