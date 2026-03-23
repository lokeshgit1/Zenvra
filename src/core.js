const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class Automo {
    constructor(config = {}) {
        this.config = config;
        this.genAI = null;
        this.model = null;
        
        if (process.env.GEMINI_API_KEY) {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        }
    }

    async run(command) {
        return new Promise((resolve, reject) => {
            exec(command, { shell: true }, (error, stdout, stderr) => {
                if (error) return reject(error.message);
                resolve(stdout.trim() || stderr.trim());
            });
        });
    }

    async generateAICommitMessage(diff) {
        try {
            if (!this.model || !diff || diff.trim() === '') return null;
            const prompt = `Write a professional, concise, and descriptive Git commit message for the following code changes. 
            Use the Conventional Commits format (e.g., feat: ..., fix: ..., chore: ..., docs: ...).
            Just return the message itself, nothing else.

            DIFF:
            ${diff}`;
            const result = await this.model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error) {
            console.error('Error generating AI commit message:', error);
            return null;
        }
    }

    logActivity(status = 'success', error = null) {
        const logPath = path.join(process.cwd(), 'automo-log.json');
        const entry = {
            time: new Date().toISOString(),
            type: 'auto',
            status: status,
            error: error
        };
        fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    }

    async sync() {
        try {
            console.log('Automo is syncing...');
            
            // Add changes
            await this.run("git add .");

            // Get diff and generate AI message
            const diff = await this.run("git diff --cached");
            if (!diff) {
                console.log('No changes to commit.');
                return;
            }

            let message = await this.generateAICommitMessage(diff);
            if (!message) {
                message = "chore: automated update";
                console.log('Using fallback commit message.');
            }
            
            console.log(`Committing with message: ${message}`);
            await this.run(`git commit -m "${message}"`);

            // Pull with rebase
            console.log('Pulling changes...');
            await this.run("git pull --rebase origin main");

            // Push
            const branch = await this.run("git rev-parse --abbrev-ref HEAD");
            console.log(`Pushing to ${branch}...`);
            await this.run(`git push origin ${branch}`);

            console.log('Sync completed successfully.');
            this.logActivity('success');
        } catch (error) {
            console.error('Sync failed:', error);
            this.logActivity('error', error.toString());
            throw error;
        }
    }
}

module.exports = Automo;
