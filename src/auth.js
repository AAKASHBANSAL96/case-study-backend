import jwt from "jsonwebtoken";
export function tokenFor(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "8h" },
  );
}
export function requireAuth(roles = []) {
  return (req, res, next) => {
    try {
      const value = req.headers.authorization || "";
      const token = value.startsWith("Bearer ") && value.slice(7);
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (!token || (roles.length && !roles.includes(user.role)))
        return res.status(403).json({ message: "Insufficient permissions" });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ message: "Authentication required" });
    }
  };
}
