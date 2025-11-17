const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { POST_PICTURE_DIR } = require('../../config');

function createRandwoSting(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {  
        result += characters.charAt(Math.floor(Math.random()*characters.length));
    }
    return result;
}

const pictureStorage = (POST_PICTURE) => {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            let dest = POST_PICTURE_DIR;
            const avatarPath = path.join(__dirname, '..', '..', dest);
            if(!fs.existsSync(avatarPath)){
                fs.mkdirSync(avatarPath, { recursive: true });
            }
            cb(null, avatarPath);
        },
        filename: (req, file, cb) => {
            const filename = `${Date.now()}-${createRandwoSting(8)}${path.extname(file.originalname).toLowerCase()}`
            cb(null, filename);
        }
    });
} 