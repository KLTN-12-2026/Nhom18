const fs = require('fs')
const path = require('path')

class SecurityLogger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs')
    this.securityLogFile = path.join(this.logDir, 'security.log')
    
    // Create logs directory if not exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  formatLog(level, event, details) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...details
    }) + '\n'
  }

  writeLog(logEntry) {
    try {
      fs.appendFileSync(this.securityLogFile, logEntry, 'utf8')
    } catch (error) {
      console.error('Failed to write security log:', error)
    }
  }

  // Log authentication events
  logAuth(type, details) {
    const logEntry = this.formatLog('INFO', `AUTH_${type.toUpperCase()}`, {
      userId: details.userId,
      username: details.username,
      ip: details.ip,
      userAgent: details.userAgent,
      success: details.success,
      reason: details.reason
    })
    this.writeLog(logEntry)
  }

  // Log failed login attempts
  logFailedLogin(details) {
    const logEntry = this.formatLog('WARN', 'FAILED_LOGIN', {
      username: details.username,
      ip: details.ip,
      userAgent: details.userAgent,
      reason: details.reason,
      attemptCount: details.attemptCount
    })
    this.writeLog(logEntry)
  }

  // Log suspicious activities
  logSuspicious(type, details) {
    const logEntry = this.formatLog('WARN', `SUSPICIOUS_${type.toUpperCase()}`, {
      userId: details.userId,
      ip: details.ip,
      userAgent: details.userAgent,
      action: details.action,
      details: details.details
    })
    this.writeLog(logEntry)
  }

  // Log data access
  logDataAccess(details) {
    const logEntry = this.formatLog('INFO', 'DATA_ACCESS', {
      userId: details.userId,
      resource: details.resource,
      action: details.action,
      ip: details.ip,
      success: details.success
    })
    this.writeLog(logEntry)
  }

  // Log admin actions
  logAdminAction(details) {
    const logEntry = this.formatLog('INFO', 'ADMIN_ACTION', {
      adminId: details.adminId,
      action: details.action,
      target: details.target,
      ip: details.ip,
      changes: details.changes
    })
    this.writeLog(logEntry)
  }

  // Log payment transactions
  logPayment(details) {
    const logEntry = this.formatLog('INFO', 'PAYMENT', {
      userId: details.userId,
      amount: details.amount,
      status: details.status,
      txnRef: details.txnRef,
      ip: details.ip
    })
    this.writeLog(logEntry)
  }

  // Log security incidents
  logIncident(type, details) {
    const logEntry = this.formatLog('ERROR', `INCIDENT_${type.toUpperCase()}`, {
      userId: details.userId,
      ip: details.ip,
      description: details.description,
      severity: details.severity,
      evidence: details.evidence
    })
    this.writeLog(logEntry)
  }

  // Log rate limit violations
  logRateLimit(details) {
    const logEntry = this.formatLog('WARN', 'RATE_LIMIT_EXCEEDED', {
      ip: details.ip,
      endpoint: details.endpoint,
      requestCount: details.requestCount,
      userAgent: details.userAgent
    })
    this.writeLog(logEntry)
  }

  // Log validation errors (potential attacks)
  logValidationError(details) {
    const logEntry = this.formatLog('WARN', 'VALIDATION_ERROR', {
      ip: details.ip,
      endpoint: details.endpoint,
      errors: details.errors,
      userAgent: details.userAgent
    })
    this.writeLog(logEntry)
  }
}

// Middleware to log requests
const requestLogger = (req, res, next) => {
  const logger = new SecurityLogger()
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /union.*select/i,  // SQL injection
    /<script/i,        // XSS
    /\.\.\/\.\.\//,    // Path traversal
    /eval\(/i,         // Code injection
    /exec\(/i
  ]

  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params
  })

  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(requestData)
  )

  if (isSuspicious) {
    logger.logSuspicious('request', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      action: `${req.method} ${req.path}`,
      details: requestData
    })
  }

  next()
}

module.exports = {
  SecurityLogger,
  requestLogger
}
