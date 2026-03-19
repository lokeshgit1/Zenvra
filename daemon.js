const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Function to log activity in JSON format
function logActivity() {
    const logPath = path.join(__dirname, 'daemon-log.json');
    const entry = {
        time: new Date().toISOString(),
        type: 'auto'
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

// Create a function to run the daemon in the background
function touchFile() {
    const filepath = path.join(__dirname, 'daemon.txt');
    const content = `Daemon run at: ${new Date().toLocaleString()}\n`;
    fs.appendFileSync(filepath, content);
    logActivity();
}

//deamoning
async function daemoning() {
    try {
        console.log('Daemon is running...');

        // step 1: Update local file
        touchFile();

        // step 2: Pull with rebase to handle remote changes
        console.log('Pulling with rebase...');
        await run("git pull --rebase origin main");

        // step 3: Add changes
        await run("git add .");

        // step 4: Commit with smart message
        const messages = [
            "chore: automated update",
            "fix: sync daemon logs",
            "feat: update tracking data",
              "docs: update daemon activity"
        ];
        const message = messages[Math.floor(Math.random() * messages.length)];
        
        console.log(`Committing with message: ${message}`);
        await run(`git commit -m "${message}" || echo "No changes to commit"`);

        // step 5: Push to current branch
        const branch = await run("git rev-parse --abbrev-ref HEAD");
        console.log(`Pushing to ${branch}...`);
        await run(`git push origin ${branch}`);

        console.log('Daemon has completed its tasks.');
    } catch (error) {
        console.error('Error running daemon:', error);
    }
}

// Run the daemon
daemoning();

// run every 1hr 
setInterval(daemoning, 60 * 60 * 1000);