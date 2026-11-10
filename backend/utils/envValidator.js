/**
 * Environment variable validation
 * Ensures all required environment variables are set and secure
 */

const validateEnvironment = () => {
  const errors = []
  const warnings = []

  // Required variables
  const required = {
    'DB_HOST': process.env.DB_HOST,
    'DB_USER': process.env.DB_USER,
    'DB_PASSWORD': process.env.DB_PASSWORD,
    'DB_NAME': process.env.DB_NAME,
    'JWT_SECRET': process.env.JWT_SECRET,
  }

  // Check required variables
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      errors.push(`❌ Missing required environment variable: ${key}`)
    }
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      errors.push(`❌ JWT_SECRET is too short (minimum 32 characters). Current: ${process.env.JWT_SECRET.length} characters`)
    }
    
    // Check for default/weak secrets
    const weakSecrets = [
      'your-secret-key',
      'your-super-secret-jwt-key',
      'change-in-production',
      'secret',
      '123456',
      'password'
    ]
    
    const isWeak = weakSecrets.some(weak => 
      process.env.JWT_SECRET.toLowerCase().includes(weak.toLowerCase())
    )
    
    if (isWeak) {
      errors.push(`❌ JWT_SECRET appears to be a default/weak value. Please use a strong random secret.`)
      errors.push(`   Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
    }
  }

  // Check database password strength
  if (process.env.DB_PASSWORD) {
    if (process.env.DB_PASSWORD.length < 8) {
      warnings.push(`⚠️  DB_PASSWORD is weak (less than 8 characters)`)
    }
  }

  // Check NODE_ENV
  if (!process.env.NODE_ENV) {
    warnings.push(`⚠️  NODE_ENV is not set. Defaulting to 'development'`)
    process.env.NODE_ENV = 'development'
  }

  // Production-specific checks
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.FRONTEND_URL) {
      warnings.push(`⚠️  FRONTEND_URL is not set in production`)
    }
    
    if (process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1') {
      warnings.push(`⚠️  Using localhost for database in production`)
    }

    // Check for debug mode
    if (process.env.DEBUG === 'true') {
      warnings.push(`⚠️  DEBUG mode is enabled in production`)
    }
  }

  // Optional but recommended variables
  const optional = {
    'PORT': process.env.PORT || 5000,
    'FRONTEND_URL': process.env.FRONTEND_URL || 'http://localhost:3000',
    'ADMIN_EMAIL': process.env.ADMIN_EMAIL || 'admin@cinema.com',
  }

  // Display results
  console.log('\n🔍 Environment Variable Validation\n')
  console.log('=' .repeat(50))

  if (errors.length > 0) {
    console.log('\n❌ ERRORS (must fix):')
    errors.forEach(err => console.log(err))
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS (should fix):')
    warnings.forEach(warn => console.log(warn))
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ All environment variables are properly configured!')
  }

  console.log('\n' + '='.repeat(50))
  console.log(`Environment: ${process.env.NODE_ENV}`)
  console.log(`Port: ${optional.PORT}`)
  console.log(`Database: ${process.env.DB_USER}@${process.env.DB_HOST}/${process.env.DB_NAME}`)
  console.log(`JWT Secret Length: ${process.env.JWT_SECRET?.length || 0} characters`)
  console.log('='.repeat(50) + '\n')

  // Exit if critical errors
  if (errors.length > 0) {
    console.error('\n❌ Cannot start server due to configuration errors.\n')
    process.exit(1)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

// Generate a strong JWT secret
const generateJWTSecret = () => {
  const crypto = require('crypto')
  return crypto.randomBytes(64).toString('hex')
}

module.exports = {
  validateEnvironment,
  generateJWTSecret
}
