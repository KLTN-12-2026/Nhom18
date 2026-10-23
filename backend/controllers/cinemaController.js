const Cinema = require("../models/Cinema")

const getAllCinemas = async (req, res) => {
  try {
    const cinemas = await Cinema.findAll()
    res.json({ cinemas })
  } catch (error) {
    console.error("Get cinemas error:", error)
    res.status(500).json({ error: "Failed to fetch cinemas" })
  }
}

const getCinemaById = async (req, res) => {
  try {
    const { id } = req.params
    const cinema = await Cinema.findById(id)

    if (!cinema) {
      return res.status(404).json({ error: "Cinema not found" })
    }

    res.json({ cinema })
  } catch (error) {
    console.error("Get cinema error:", error)
    res.status(500).json({ error: "Failed to fetch cinema" })
  }
}

module.exports = { getAllCinemas, getCinemaById }
