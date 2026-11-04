const Favorite = require("../models/Favorite")

/**
 * Add movie to favorites
 */
const addFavorite = async (req, res) => {
  try {
    const userId = req.user.id
    const { movieId } = req.params

    if (!movieId) {
      return res.status(400).json({ error: "Movie ID is required" })
    }

    const favorite = await Favorite.addFavorite(userId, parseInt(movieId))

    return res.status(201).json({
      success: true,
      message: "Movie added to favorites",
      favorite
    })
  } catch (error) {
    if (error.message === 'Movie already in favorites') {
      return res.status(409).json({ error: error.message })
    }
    console.error("Add favorite error:", error)
    return res.status(500).json({ error: "Failed to add favorite" })
  }
}

/**
 * Remove movie from favorites
 */
const removeFavorite = async (req, res) => {
  try {
    const userId = req.user.id
    const { movieId } = req.params

    if (!movieId) {
      return res.status(400).json({ error: "Movie ID is required" })
    }

    const removed = await Favorite.removeFavorite(userId, parseInt(movieId))

    if (!removed) {
      return res.status(404).json({ error: "Favorite not found" })
    }

    return res.json({
      success: true,
      message: "Movie removed from favorites"
    })
  } catch (error) {
    console.error("Remove favorite error:", error)
    return res.status(500).json({ error: "Failed to remove favorite" })
  }
}

/**
 * Get all user favorites
 */
const getUserFavorites = async (req, res) => {
  try {
    const userId = req.user.id

    const favorites = await Favorite.getUserFavorites(userId)

    return res.json({
      success: true,
      favorites,
      count: favorites.length
    })
  } catch (error) {
    console.error("Get favorites error:", error)
    return res.status(500).json({ error: "Failed to get favorites" })
  }
}

/**
 * Check if movie is favorited
 */
const checkFavorite = async (req, res) => {
  try {
    const userId = req.user.id
    const { movieId } = req.params

    const isFavorite = await Favorite.isFavorite(userId, parseInt(movieId))

    return res.json({
      success: true,
      isFavorite
    })
  } catch (error) {
    console.error("Check favorite error:", error)
    return res.status(500).json({ error: "Failed to check favorite" })
  }
}

/**
 * Get user's favorite movie IDs
 */
const getFavoriteIds = async (req, res) => {
  try {
    const userId = req.user.id

    const favoriteIds = await Favorite.getUserFavoriteIds(userId)

    return res.json({
      success: true,
      favoriteIds
    })
  } catch (error) {
    console.error("Get favorite IDs error:", error)
    return res.status(500).json({ error: "Failed to get favorite IDs" })
  }
}

module.exports = {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  checkFavorite,
  getFavoriteIds
}
