# Online Pharmacy Management System – ChatGPT Edition

A B.Tech mini-project using HTML, CSS, JavaScript, Node.js/Express and MySQL.

## Features
- Customer registration and login (passwords hashed with bcrypt)
- Search medicines by name or category and view prices, stock and expiry dates
- Add medicines to a cart and place orders
- Stock is reduced transactionally when an order is placed
- Admin-only medicine creation and low-stock / near-expiry alerts
- Customer order history; admins can view all orders

## Database tables
1. `users`: `user_id`, `name`, `email`, `password`, `phone`, `role`
2. `medicines`: `medicine_id`, `medicine_name`, `category`, `manufacturer`, `price`, `stock`, `expiry_date`
3. `orders`: `order_id`, `user_id`, `order_date`, `total_amount`, `status`
4. `order_items`: `order_item_id`, `order_id`, `medicine_id`, `quantity`, `unit_price`

The extra `order_items` table is necessary because one order can contain multiple medicines.

## Requirements
- Node.js 18+
- MySQL 8+
- VS Code (recommended)

## Setup
1. Extract this project folder.
2. Open MySQL Workbench or the MySQL command line and run `database.sql`.
3. Open a terminal in this project folder and run:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and enter your MySQL password and a long random `JWT_SECRET`.
5. Start the server:
   ```bash
   npm run dev
   ```
   or `npm start`.
6. Open `http://localhost:3000`.

## Create an admin
Register a user through the website. Then run this SQL in MySQL:
```sql
USE pharmacy_db;
UPDATE users SET role='admin' WHERE email='your-email@example.com';
```
Log out and log in again so the new role is included in the login token.

## Upload to GitHub
Create a new empty repository on GitHub, then run these commands in the project folder:
```bash
git init
git add .
git commit -m "Initial Online Pharmacy Management System"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/online-pharmacy-management-system.git
git push -u origin main
```
Do not upload your real `.env` file. It contains database credentials. The included `.env.example` is safe to upload.

## Important academic/demo note
This is an educational prototype, not a production pharmacy platform. A real pharmacy system needs pharmacist review, prescription validation where legally required, payment integration, audit logging, stronger security controls, and applicable regulatory/privacy compliance. Do not use it to dispense medicines to real patients.
