require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

//run the daemon
function run(command) {
    return new Promise((resolve, reject) => {
        exec(command, { shell: true }, (error, stdout, stderr) => {
            if (error) {
                return reject(error.message);
            }
            resolve(stdout.trim() || stderr.trim());
        });
    });
}

// Function to generate AI commit message
async function generateAICommitMessage(diff) {
    try {
        if (!diff || diff.trim() === '') return null;

        const prompt = `Write a professional, concise, and descriptive Git commit message for the following code changes. 
        Use the Conventional Commits format (e.g., feat: ..., fix: ..., chore: ..., docs: ...).
        Just return the message itself, nothing else.

        DIFFF:
        ${diff}`;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error('Error generating AI commit message:', error);
        return null;
    }
}

// Function to log activity in JSON format
function logActivity(status = 'success', error = null) {
    const logPath = path.join(__dirname, 'daemon-log.json');
    const entry = {
        time: new Date().toISOString(),
        type: 'auto',
        status: status,
        error: error
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

// Create a function to run the daemon in the background
function touchFile() {
    const filepath = path.join(__dirname, 'daemon.txt');
    const content = `Daemon run at: ${new Date().toLocaleString()}\n`;
    fs.appendFileSync(filepath, content);
    logActivity('success');
}

//deamoning
async function daemoning() {
    try {
        console.log('Daemon is running...');

        // step 1: Update local file
        touchFile();

        // step 2: Add changes
        await run("git add .");

        // step 3: Get diff and generate AI message
        console.log('Generating AI commit message...');
        const diff = await run("git diff --cached");
        let message = await generateAICommitMessage(diff);

        // Fallback if AI fails
        if (!message) {
            const fallbackMessages = [
                "chore: automated update",
                "fix: sync daemon logs",
                "feat: update tracking data",
                "docs: update daemon activity"
            ];
            message = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
            console.log('Using fallback commit message.');
        }
        
        console.log(`Committing with message: ${message}`);
        await run(`git commit -m "${message}" || echo "No changes to commit"`);

        // step 4: Pull with rebase to handle remote changes
        console.log('Pulling with rebase...');
        await run("git pull --rebase origin main");

        // step 5: Push to current branch
        const branch = await run("git rev-parse --abbrev-ref HEAD");
        console.log(`Pushing to ${branch}...`);
        await run(`git push origin ${branch}`);

        console.log('Daemon has completed its tasks.');
    } catch (error) {
        console.error('Error running daemon:', error);
        logActivity('error', error.toString());
    }
}

// Run the daemon
daemoning();

// run every 1hr 
setInterval(daemoning, 60 * 60 * 1000);