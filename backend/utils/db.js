const { pool } = require("../config/database")

/**
 * Runs `callback` inside a MySQL transaction. `callback` receives a
 * connection (not the pool) and must use connection.execute/connection.query
 * for every statement that needs to be part of the transaction.
 * Commits on resolve, rolls back and rethrows on reject. Always releases.
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (err) {
    await connection.rollback()
    throw err
  } finally {
    connection.release()
  }
}

module.exports = { withTransaction }
