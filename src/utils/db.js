
import mongoose from 'mongoose';

export const connectDB = async () => {
    const dbUrl = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!dbUrl) {
        console.log('⚠️ No MongoDB URI found in environment variables. Running without Database.');
        return;
    }

    try {
        await mongoose.connect(dbUrl);
        console.log('✅ Connected to MongoDB successfully.');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        // Error throw nahi karenge taaki bot crash na ho
    }
};

export default connectDB;
