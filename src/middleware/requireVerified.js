module.exports = (req, res, next) => {
  if (!req.user) return res.sendStatus(401);

  const ok = req.user.is_verified === true || req.user.is_verified === 1;

  if (!ok) {
    return res.status(403).json({ message: "Account not verified" });
  }

  next();
};