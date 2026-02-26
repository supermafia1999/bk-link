const errorMiddleware = (err, req, res, next) => {
  console.error('Error:', err);

  // Prisma errors
  if (err.code) {
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'Duplicate entry',
          message: `A record with this ${err.meta?.target?.join(', ')} already exists`
        });
      case 'P2003':
        return res.status(400).json({
          error: 'Foreign key constraint failed',
          message: 'Referenced record does not exist'
        });
      case 'P2025':
        return res.status(404).json({
          error: 'Record not found',
          message: err.meta?.cause || 'The requested record was not found'
        });
      case 'P2014':
        return res.status(400).json({
          error: 'Invalid ID',
          message: 'The provided ID is invalid'
        });
    }
  }

  // Custom application errors
  if (err.name === 'AppError') {
    return res.status(err.statusCode || 400).json({
      error: err.message,
      code: err.code
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      message: 'The provided token is invalid'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      message: 'The provided token has expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

class AppError extends Error {
  constructor(message, statusCode = 400, code = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = errorMiddleware;
module.exports.AppError = AppError;
