# Render Deployment Guide

This guide provides step-by-step instructions on how to deploy this MERN stack e-commerce backend (which serves the pre-built React frontend from the `build` directory) to **Render**.

---

## Prerequisites

Before deploying, ensure you have the following resources:
1. **Render Account**: Create one at [render.com](https://render.com).
2. **MongoDB Atlas Database**: A hosted MongoDB database. Obtain your connection string (e.g., `mongodb+srv://...`).
3. **Stripe Account (Optional)**: If you want to process payments, obtain your Stripe Secret key and endpoint secret.
4. **Gmail SMTP / Nodemailer Details (Optional)**: If you want to send emails (order invoices/reset password), ensure you have an App Password generated for your Google/Gmail account.

---

## 1. Prepare Codebase for Render

Render looks at the `package.json` for startup scripts. This repository is already configured with:
- **Build Command**: `npm install` (Render runs this automatically).
- **Start Command**: `npm start` (which executes `node index.js`).

### Port Binding
Express needs to listen on the port assigned by Render. The `index.js` file retrieves the port using `process.env.PORT`:
```javascript
server.listen(process.env.PORT, () => {
  console.log('server started');
});
```
Make sure you do **not** hardcode the port (like `8080`) when configuring environment variables on Render, as Render dynamically assigns the `PORT` variable.

---

## 2. Deploy on Render as a Web Service

1. **Log in** to your Render Dashboard.
2. Click **New +** and select **Web Service**.
3. **Connect your Git repository** (GitHub or GitLab) where this codebase is hosted.
4. Configure the service with the following settings:
   - **Name**: Choose a unique name (e.g., `my-ecommerce-backend`).
   - **Region**: Select the region closest to your target audience.
   - **Branch**: Choose your main deployment branch (e.g., `main` or `master`).
   - **Root Directory**: Leave it blank (the root of the repository).
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

---

## 3. Configure Environment Variables

Render allows you to securely specify environment variables. In the **Environment** tab of your Render Web Service settings, add the following variables:

| Key | Value Description | Example / Note | Required |
| :--- | :--- | :--- | :--- |
| `MONGODB_URL` | Your MongoDB Atlas connection URI | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` | **Yes** |
| `JWT_SECRET_KEY` | A secret string used to sign JWTs | e.g. `some_long_random_jwt_secret_string` | **Yes** |
| `SESSION_KEY` | A secret string used for express-session signing | e.g. `some_long_random_session_secret_string` | **Yes** |
| `ADMIN_EMAIL` | The administrator's login email address | `admin@gmail.com` | **Yes** |
| `ADMIN_PASSWORD` | The administrator's login password | `AdminSecretPassword123!` | **Yes** |
| `STRIPE_SERVER_KEY`| Your Stripe Secret API Key | `sk_test_...` (Keep blank/dummy if unused) | No |
| `ENDPOINT_SECRET` | Your Stripe Webhook Signing Secret | `whsec_...` (Keep blank/dummy if unused) | No |
| `MAIL_PASSWORD` | App Password for Nodemailer GMail SMTP | Gmail App Password (NOT your login password) | No |

*Note: You do not need to define `PORT`. Render automatically injects the `PORT` environment variable and binds your service to it.*

---

## 4. How the Frontend works in this Deployment

This backend is designed as a **single-unit deployment**:
- It serves static assets from the `build/` directory using:
  ```javascript
  server.use(express.static(path.resolve(__dirname, 'build')));
  ```
- Any unrecognized requests (client-side React routing) are redirected back to the React app:
  ```javascript
  server.get('*', (req, res) =>
    res.sendFile(path.resolve('build', 'index.html'))
  );
  ```
- Therefore, when you deploy this backend to Render, your React frontend is **fully deployed and accessible** under the same URL!

---

## 5. Setup Webhooks (If using Stripe)

If you are using Stripe payment processing:
1. Copy the URL of your deployed Render Web Service (e.g. `https://my-ecommerce-backend.onrender.com`).
2. Go to your **Stripe Dashboard** -> **Developers** -> **Webhooks**.
3. Add an endpoint pointing to `https://my-ecommerce-backend.onrender.com/webhook`.
4. Select the event `payment_intent.succeeded` to listen to.
5. Copy the signing secret (`whsec_...`) and update your `ENDPOINT_SECRET` environment variable in Render.

---

## Troubleshooting

### ⚠️ Common Crash: `TypeError: JwtStrategy requires a secret or key` / Environment Variables Check
If the application crashes during deployment or you see an error like:
```text
TypeError: JwtStrategy requires a secret or key
```
This means that the application failed to find the required environment variables.
In this updated codebase, a graceful check is added to inspect if `MONGODB_URL`, `JWT_SECRET_KEY`, `SESSION_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are defined. If any of them are missing, the server will output a detailed and clean error message indicating exactly which variable(s) you forgot to specify in the Render Dashboard, and then gracefully exit with status 1.

**To fix this:**
1. Navigate to your Web Service page in the **Render Dashboard**.
2. Click on the **Environment** tab on the left-side menu.
3. Verify that `MONGODB_URL`, `JWT_SECRET_KEY`, `SESSION_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are all listed in the table and have correct non-empty values.
4. Click **Save Changes** and trigger a **Manual Deploy** -> **Clear Build Cache & Deploy**.

- **Database Connection fails**: Double check that your MongoDB cluster has **network access from anywhere (`0.0.0.0/0`)** enabled in the MongoDB Atlas Network Access settings, since Render's outward-facing IPs are dynamic.
- **Port Binding Issues**: If the application crashes on start, verify that you didn't override the `PORT` variable manually with an incompatible port value. Render manages this automatically.
- **Email Invoices fail**: Ensure that GMail's "Less Secure Apps" setting or "App Passwords" are correctly configured. App Passwords are required if 2-Factor Authentication is active on your Gmail account.
