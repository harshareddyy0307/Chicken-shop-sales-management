import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/chicken_shop_db',
  jwtSecret: process.env.JWT_SECRET || 'chicken_shop_management_jwt_super_secret_key_2026_xyz',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  shopName: process.env.SHOP_NAME || 'Star Fresh Chicken & Meat Center',
  shopAddress: process.env.SHOP_ADDRESS || 'Shop #4, Market Yard Road, Hyderabad, Telangana',
  shopPhone: process.env.SHOP_PHONE || '+91 98765 43210',
  currencySymbol: process.env.CURRENCY_SYMBOL || '₹',
  dateFormat: process.env.DATE_FORMAT || 'DD-MM-YYYY',
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  nodeEnv: process.env.NODE_ENV || 'development',
  uploadDir: path.resolve(__dirname, '../../uploads'),
};
