const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  NODE_ENV,
} = require("../../config");

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "1d";
const REFRESH_COOKIE_NAME = "jwt";

const REFRESH_TOKEN_BCRYPT_ROUNDS = 12;

const isProd = String(NODE_ENV || process.env.NODE_ENV || "")
  .toLowerCase()
  .trim() === "production";

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000,
  path: "/", 
};

const signAccessToken = (user) => {
  return jwt.sign(
    {
      type: "access",
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      department_id: user.department_id,
    },
    ACCESS_TOKEN_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    }
  );
};

const signRefreshToken = (user) => {
  return jwt.sign(
    {
      type: "refresh",
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      department_id: user.department_id,
    },
    REFRESH_TOKEN_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    }
  );
};

const hashRefreshToken = async (refreshToken) => {
  if (!refreshToken) throw new Error("refreshToken is required");
  return bcrypt.hash(String(refreshToken), REFRESH_TOKEN_BCRYPT_ROUNDS);
};

const compareRefreshToken = async (refreshToken, refreshTokenHash) => {
  if (!refreshToken || !refreshTokenHash) return false;
  return bcrypt.compare(String(refreshToken), String(refreshTokenHash));
};

module.exports = {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  hashRefreshToken,
  compareRefreshToken,
};