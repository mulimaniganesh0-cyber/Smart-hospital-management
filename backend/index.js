// index.js
const app = require('./src/app');
const http = require('http');
const { pool, testConnection } = require('./src/config/database');

// Get local IP addresses for display
const getLocalIPs = () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const results = [];
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    }
    return results;
};

const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// Start server only after database connection
const startServer = async () => {
    console.log('🔍 Checking database connection...');
    let isDbConnected = false;
    
    try {
        isDbConnected = await testConnection();
    } catch (error) {
        console.warn('⚠️ Database connection test failed:', error.message);
        isDbConnected = false;
    }
    
    if (!isDbConnected && process.env.NODE_ENV === 'production') {
        console.error('❌ Cannot start server: Database connection failed');
        process.exit(1);
    }
    
    // Check Gemini API availability
    if (process.env.GEMINI_API_KEY) {
        console.log('🤖 Gemini AI service initialized');
    } else {
        console.warn('⚠️ GEMINI_API_KEY not set - chatbot will use fallback mode');
    }
    
    server.listen(PORT, () => {
        console.log(`\n🚀 Server running on port ${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`\n📡 Access URLs:`);
        console.log(`   Local: http://localhost:${PORT}`);
        console.log(`   Local: http://127.0.0.1:${PORT}`);
        
        // Display network access URLs
        const ips = getLocalIPs();
        if (ips.length > 0) {
            console.log(`\n📡 Network Access:`);
            ips.forEach(ip => {
                console.log(`   ${ip}: http://${ip}:${PORT}`);
            });
        }
        
        if (!isDbConnected) {
            console.warn('\n⚠️  Running without database connection (development mode)');
        } else {
            console.log('\n✅ Database connected');
        }
        console.log('');
        
        // Log server features
        console.log('🔧 Server Features:');
        console.log('   - 🔐 Authentication & Authorization');
        console.log('   - 🏥 Hospital Management');
        console.log('   - 👤 Patient Management');
        console.log('   - 📅 Appointment Management');
        console.log('   - 🚨 Emergency Services');
        console.log('   - 🩸 Blood Bank Management');
        console.log('   - 🚑 Ambulance Services');
        console.log('   - 📊 Resource Management');
        console.log('   - 📈 Reports & Analytics');
        console.log('   - 🤖 AI-powered Chatbot with Gemini');
        console.log('   - 📢 Donation Campaigns');
        console.log('   - 👑 Admin Dashboard');
        console.log('   - 🔔 Real-time Notifications');
        console.log('   - 💳 Role-based Access Control');
        
        if (process.env.GEMINI_API_KEY) {
            console.log('   - 🇮🇳 Multilingual support (Kannada, Hindi, Tamil, Telugu, etc.)');
        }
        console.log('');
    });
};

// Handle server startup errors
try {
    startServer();
} catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
}

// Graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 ${signal} signal received: closing HTTP server`);
    
    server.close(() => {
        console.log('✅ HTTP server closed');
        if (pool && pool.end) {
            pool.end(() => {
                console.log('✅ Database connection closed');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
    
    // Force shutdown after timeout
    setTimeout(() => {
        console.error('❌ Force shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('Unhandled Rejection');
});

module.exports = { server };