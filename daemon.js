const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

//run the daemon
function run(command) {
    return new Promise((resolve, reject) => {
        exec( command ,{shell: true}, (error, stdout, stderr) => {
            if (error) {
                return reject(error.message);
            }             resolve(stdout.trim() || stderr.trim());

        });
    });
}

// Create a function to run the daemon in the background
function touchFile(){
    const filepath = path.join(__dirname, 'daemon.txt');

    const content = `Daemon run at: ${new Date().toLocaleString()}\n`;

    fs.appendFileSync(filepath, content);
}

//deamoning
async function daemoning() {
    try {
        console.log('Daemon is running...');

        //step1 +: forceing the daemon
        touchFile();

        //step 2 : add a delay to simulate work
        await run("git add .");

        //step 3 : add a delay to simulate work
        const message = `Daemon commit at: ${new Date().toLocaleString()}`;
        await run(`git commit -m "${message}"`);

        //step 4 : add a delay to simulate work
        const branch = await run("git rev-parse --abbrev-ref HEAD");

        //step 5 : add a delay to simulate work
        await run(`git push origin ${branch}`);

        console.log('Daemon has completed its tasks.');
    } catch (error) {
        console.error('Error running daemon:', error);
    }
}

// Run the daemon
daemoning();

//run every  1hr 
setInterval(daemoning, 60 * 60 * 1000);