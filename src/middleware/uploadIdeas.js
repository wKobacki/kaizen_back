const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(process.cwd(), "upload", "ideas");

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9_-]/gi, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype?.startsWith("image/")) return cb(null, true);
  cb(new Error("Only image files are allowed"), false);
};

const uploadIdeas = multer({
  storage,
  fileFilter,
  limits: {
    files: 3,
    fileSize: 5 * 1024 * 1024,  
  },
});

module.exports = uploadIdeas;
