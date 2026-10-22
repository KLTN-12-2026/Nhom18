const { pool } = require("../config/database")

class Favorite {
  /**
   * Add movie to favorites
   */
  static async addFavorite(userId, movieId) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO favorites (user_id, movie_id) VALUES (?, ?)`,
        [userId, movieId]
      )
      return { id: result.insertId, user_id: userId, movie_id: movieId }
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Movie already in favorites')
      }
      throw error
    }
  }

  /**
   * Remove movie from favorites
   */
  static async removeFavorite(userId, movieId) {
    const [result] = await pool.execute(
      `DELETE FROM favorites WHERE user_id = ? AND movie_id = ?`,
      [userId, movieId]
    )
    return result.affectedRows > 0
  }

  /**
   * Check if movie is favorited by user
   */
  static async isFavorite(userId, movieId) {
    const [rows] = await pool.execute(
      `SELECT id FROM favorites WHERE user_id = ? AND movie_id = ?`,
      [userId, movieId]
    )
    return rows.length > 0
  }

  /**
   * Get all favorites for a user with movie details
   */
  static async getUserFavorites(userId) {
    const [rows] = await pool.execute(
      `SELECT 
        f.id as favorite_id,
        f.created_at,
        m.*
       FROM favorites f
       JOIN movies m ON f.movie_id = m.id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [userId]
    )
    return rows
  }

  /**
   * Get favorite count for a movie
   */
  static async getFavoriteCount(movieId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM favorites WHERE movie_id = ?`,
      [movieId]
    )
    return rows[0].count
  }

  /**
   * Get user's favorite movie IDs (for quick checking)
   */
  static async getUserFavoriteIds(userId) {
    const [rows] = await pool.execute(
      `SELECT movie_id FROM favorites WHERE user_id = ?`,
      [userId]
    )
    return rows.map(row => row.movie_id)
  }
}

module.exports = Favorite
