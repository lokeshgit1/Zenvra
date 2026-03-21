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

// Function to fetch Bitcoin price
async function fetchBitcoinPrice() {
    try {
        console.log('Fetching Bitcoin price...');
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.bitcoin.usd;
    } catch (error) {
        console.error('Error fetching Bitcoin price:', error);
        return null;
    }
}

// Function to fetch weather
async function fetchWeather(lat, lon) {
    try {
        console.log(`Fetching weather for ${lat}, ${lon}...`);
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return {
            temp: data.current_weather.temp,
            condition: data.current_weather.weathercode,
            time: data.current_weather.time
        };
    } catch (error) {
        console.error('Error fetching weather:', error);
        return null;
    }
}

// Function to fetch exchange rate (USD to INR)
async function fetchExchangeRate() {
    try {
        console.log('Fetching USD/INR exchange rate...');
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.rates.INR;
    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        return null;
    }
}

// Function to ping websites
async function pingSites(urls) {
    const results = [];
    for (const url of urls) {
        try {
            console.log(`Pinging ${url}...`);
            const start = Date.now();
            const response = await fetch(url, { method: 'GET', timeout: 5000 });
            const responseTime = Date.now() - start;
            results.push({
                url: url,
                status: response.ok ? 'online' : 'offline',
                responseTime: responseTime,
                code: response.status
            });
        } catch (error) {
            console.error(`Error pinging ${url}:`, error);
            results.push({
                url: url,
                status: 'offline',
                error: error.toString()
            });
        }
    }
    return results;
}

// Function to fetch GitHub stats
async function fetchGitHubStats(username) {
    try {
        console.log(`Fetching GitHub stats for ${username}...`);
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (process.env.GITHUB_PAT) {
            headers['Authorization'] = `token ${process.env.GITHUB_PAT}`;
        }
        
        // Parallel fetch for main profile and activity counts
        const [userRes, commitRes, prRes, issueRes, reposRes] = await Promise.all([
            fetch(`https://api.github.com/users/${username}`, { headers }),
            fetch(`https://api.github.com/search/commits?q=author:${username}`, { headers }),
            fetch(`https://api.github.com/search/issues?q=author:${username}+type:pr`, { headers }),
            fetch(`https://api.github.com/search/issues?q=author:${username}+type:issue`, { headers }),
            fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=30`, { headers })
        ]);

        if (!userRes.ok) throw new Error(`User API error! status: ${userRes.status}`);
        const userData = await userRes.json();
        const totalCommits = commitRes.ok ? (await commitRes.json()).total_count : 0;
        const totalPRs = prRes.ok ? (await prRes.json()).total_count : 0;
        const totalIssues = issueRes.ok ? (await issueRes.json()).total_count : 0;
        const repos = reposRes.ok ? await reposRes.json() : [];

        // Aggregate stars and languages
        let totalStars = 0;
        const langMap = {};
        for (const repo of repos) {
            totalStars += repo.stargazers_count;
            if (repo.language) {
                langMap[repo.language] = (langMap[repo.language] || 0) + 1;
            }
        }

        // Convert language map to percentages
        const totalLangs = Object.values(langMap).reduce((a, b) => a + b, 0);
        const languages = {};
        for (const lang in langMap) {
            languages[lang] = Math.round((langMap[lang] / totalLangs) * 10000) / 100;
        }

        const topProject = repos.length > 0 ? {
            name: repos[0].name,
            stars: repos[0].stargazers_count,
            language: repos[0].language
        } : null;

        return {
            followers: userData.followers,
            public_repos: userData.public_repos,
            private_repos: userData.total_private_repos || 0,
            total_stars: totalStars,
            total_commits: totalCommits,
            total_prs: totalPRs,
            total_issues: totalIssues,
            languages: languages,
            top_project: topProject
        };
    } catch (error) {
        console.error('Error fetching GitHub stats:', error);
        return null;
    }
}

// Function to update data.json with history
function updateData(btcPrice, weather, github, uptime, exchangeRate) {
    const dataPath = path.join(__dirname, 'data.json');
    let history = [];
    if (fs.existsSync(dataPath)) {
        try {
            const content = fs.readFileSync(dataPath, 'utf8');
            // Clean up potential git conflict markers if they exist
            const cleanContent = content.replace(/<<<<<<<[\s\S]*?=======[\s\S]*?>>>>>>>.*?\n/g, '');
            history = JSON.parse(cleanContent || '[]');
        } catch (e) {
            console.error('Error reading/parsing data.json, resetting:', e);
            history = [];
        }
    }
    
    // Ensure history is an array
    if (!Array.isArray(history)) history = [];

    history.push({
        time: new Date().toISOString(),
        price: btcPrice,
        weather: weather,
        github: github,
        uptime: uptime,
        exchangeRate: exchangeRate
    });

    // Keep only last 24 entries
    if (history.length > 24) history.shift();

    fs.writeFileSync(dataPath, JSON.stringify(history, null, 2));
}

// Create a function to run the daemon in the background
async function touchFile() {
    try {
        const filepath = path.join(__dirname, 'daemon.txt');
        const content = `Daemon run at: ${new Date().toLocaleString()}\n`;
        fs.appendFileSync(filepath, content);
        
        // Read config
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        const [price, weather, github, uptime, exchangeRate] = await Promise.all([
            fetchBitcoinPrice(),
            fetchWeather(config.location.lat, config.location.lon),
            fetchGitHubStats(config.github.username),
            pingSites(config.monitors || []),
            fetchExchangeRate()
        ]);

        if (price || weather || github || uptime || exchangeRate) {
            updateData(price, weather, github, uptime, exchangeRate);
        }
        
        logActivity('success');
    } catch (error) {
        console.error('Error in touchFile:', error);
        logActivity('error', error.toString());
    }
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