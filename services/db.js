const mongoose = require('mongoose');
const crypto = require('crypto');
const { User } = require('../model/User');

async function initializeAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    try {
      let adminUser = await User.findOne({ email: adminEmail });
      const salt = crypto.randomBytes(16);
      const hashedPassword = crypto.pbkdf2Sync(
        adminPassword,
        salt,
        310000,
        32,
        'sha256'
      );

      if (adminUser) {
        adminUser.password = hashedPassword;
        adminUser.salt = salt;
        adminUser.role = 'admin';
        await adminUser.save();
        console.log(`Admin user (${adminEmail}) updated successfully from environment variables.`);
      } else {
        adminUser = new User({
          email: adminEmail,
          password: hashedPassword,
          salt: salt,
          role: 'admin',
          addresses: []
        });
        await adminUser.save();
        console.log(`Admin user (${adminEmail}) created successfully from environment variables.`);
      }
    } catch (err) {
      console.error('Error initializing admin user:', err);
    }
  }
}

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Database connected successfully');
    await initializeAdmin();
  } catch (err) {
    console.error('\n========================================================================');
    console.error('❌ MONGODB CONNECTION ERROR');
    console.error('========================================================================');
    console.error(`Unable to connect to MongoDB. Please ensure your MONGODB_URL is valid.`);
    console.error(`Error details: ${err.message}`);
    console.error('========================================================================\n');
    throw err;
  }
}

module.exports = { connectDB };
