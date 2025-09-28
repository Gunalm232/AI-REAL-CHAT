# 💬 Real-time Chat Application

A full-stack real-time chat application built with **HTML, CSS, JavaScript, Node.js, Socket.io, and MySQL**. Features a WhatsApp-like interface with persistent message storage.

## ✨ Features

- **Real-time messaging** with Socket.io
- **WhatsApp-like UI** with modern design
- **Message persistence** in MySQL database
- **User authentication** with username entry
- **Typing indicators** for active users
- **Message history** (last 20 messages)
- **Responsive design** for mobile and desktop
- **Auto-reconnection** handling
- **Message timestamps** and user identification

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v14 or higher)
- **MySQL** (v5.7 or higher)
- **npm** or **yarn**

### Installation

1. **Clone or download** this project
2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up MySQL database**:
   ```bash
   # Option 1: Run the SQL script
   mysql -u root -p < database.sql
   
   # Option 2: Manual setup
   mysql -u root -p
   CREATE DATABASE chat_app;
   USE chat_app;
   # Then run the table creation from database.sql
   ```

4. **Configure database** (if needed):
   - Edit `server.js` line 25-30 to match your MySQL credentials:
   ```javascript
   const dbConfig = {
       host: 'localhost',
       user: 'root',
       password: 'your_password_here', // Change this
       database: 'chat_app',
       charset: 'utf8mb4'
   };
   ```

5. **Start the server**:
   ```bash
   npm start
   ```

6. **Open your browser** and go to:
   ```
   or
   ```

## 📁 Project Structure

```
chat-app/
├── server.js              # Node.js server with Socket.io
├── package.json           # Dependencies and scripts
├── database.sql           # MySQL database schema
├── README.md              # This file
└── public/                # Frontend files
    ├── index.html         # Main HTML page
    ├── style.css          # WhatsApp-like styling
    └── script.js          # Client-side JavaScript
```

## 🛠️ Development

### Available Scripts

```bash
# Start production server
npm start

# Start development server with auto-reload
npm run dev
```

### API Endpoints

- `GET /` - Main chat application
- `GET /api/health` - Server health check
- `GET /api/stats` - Chat statistics

## 🎨 Customization

### Styling
Edit `public/style.css` to customize the appearance:
- Colors and gradients
- Message bubble styles
- Responsive breakpoints
- Animation effects

### Features
Modify `public/script.js` and `server.js` to add:
- File sharing
- Emoji reactions
- Private messaging
- User roles
- Message encryption

## 🗄️ Database Schema

```sql
CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    text VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 Configuration

### Environment Variables
Create a `.env` file for configuration:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=chat_app
```

### MySQL Setup
1. Install MySQL server
2. Create a database user (optional):
   ```sql
   CREATE USER 'chat_user'@'localhost' IDENTIFIED BY 'secure_password';
   GRANT ALL PRIVILEGES ON chat_app.* TO 'chat_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

## 🚀 Deployment

### Using PM2 (Production)
```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start server.js --name "chat-app"

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🐛 Troubleshooting

### Common Issues

1. **Database connection failed**:
   - Check MySQL is running: `systemctl status mysql`
   - Verify credentials in `server.js`
   - Ensure database exists: `SHOW DATABASES;`

2. **Port already in use**:
   - Change port in `server.js`: `const PORT = 3001;`
   - Kill process using port: `lsof -ti:3000 | xargs kill`

3. **Socket.io connection issues**:
   - Check firewall settings
   - Verify CORS configuration
   - Check browser console for errors

### Debug Mode
Enable debug logging:
```bash
DEBUG=socket.io:* npm start
```

## 📱 Mobile Support

The chat app is fully responsive and works on:
- 📱 Mobile phones (iOS/Android)
- 📱 Tablets
- 💻 Desktop computers
- 🖥️ Large screens

## 🔒 Security Notes

- **Input validation** on both client and server
- **SQL injection protection** with prepared statements
- **XSS prevention** with HTML escaping
- **Rate limiting** recommended for production
- **HTTPS** recommended for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - feel free to use this project for learning or commercial purposes.

## 🆘 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review the console logs
3. Verify all dependencies are installed
4. Ensure MySQL is running and accessible

---

**Happy Chatting! 💬✨**
