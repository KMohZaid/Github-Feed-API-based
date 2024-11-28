const express = require('express');
const path = require('path');
const axios = require('axios');
const markdownit = require('markdown-it');
const md = new markdownit();
const fs = require('fs');
const app = express();

const PORT = 3000;

function getOneLineSummaryAndDescription(event) { // TODO: make logic to merge same event by user eg. created 6 releases || 6 commits to <branch> (description)
    // TODO: return description for all events

    const actorName = event.actor.login;
    const actorAPIUrl = event.actor.url; // TODO: make normal url
    const repoName = event.repo.name;
    const repoAPIUrl = event.repo.url; // TODO: make normal url

    const actorHref = `<a href="${actorAPIUrl}" target="_blank">${actorName}</a>`;
    const repoHref = `<a href="${repoAPIUrl}" target="_blank">${repoName}</a>`;

    let action, issueHref, body;

    const eventType = event.type;
    switch (eventType) {
        case 'WatchEvent':
            return actorHref + ' starred ' + repoHref;
        case 'ReleaseEvent':
            const versionHref = `<a href="${event.payload.release.html_url}" target="_blank">${event.payload.release.tag_name}</a>`; // `release.name` is title of release 
            let description = event.payload.release.short_description_html; // TODO: add header with repo url and avatar of user/org who owns repo
            description += `<br><a href="${event.payload.release.html_url}" target="_blank">Read more</a>`;
            description = `<h1>${event.payload.release.name}</h1><br/>${description}`;
            return {
                summaryLine: actorHref + ' released ' + versionHref + ' of ' + repoHref,
                description: description,
            };
        case 'PushEvent':
            return actorHref + ' pushed to ' + repoHref;
        case 'CreateEvent':
            return actorHref + ' created a repository ' + repoHref;
        case 'ForkEvent':
            const forkHref = `<a href="https://github.com/${event.payload.forkee.full_name}" target="_blank">${event.payload.forkee.full_name}</a>`;
            return actorHref + ' forked ' + forkHref + ' from ' + repoHref;
        case 'PublicEvent':
            return actorHref + ' made ' + repoHref + ' public';
        case 'MemberEvent': // XXX: this event is not displayed in github normal feed, because it is offtopic naa
            const whomHref = `<a href="${event.payload.member.html_url}" target="_blank">${event.payload.member.login}</a>`;
            action = event.payload.action;
            return actorHref + ' ' + action + ' member ' + whomHref + ' to ' + repoHref;

        case 'IssuesEvent':
            issueHref = `<a href="${event.payload.issue.html_url}" target="_blank">${event.payload.issue.title} #${event.payload.issue.number}</a>`
            action = event.payload.action;
            body = event.payload.issue.body
            body = body ? md.render(body) : ""; // TODO: limit render and add Read more url??
            return {
                summaryLine: `${actorHref} ${action} issue ${issueHref} on ${repoHref}`,
                description: body,
            }
        case 'IssueCommentEvent':
            issueHref = `<a href="${event.payload.issue.html_url}" target="_blank">${event.payload.issue.title} #${event.payload.issue.number}</a>`;
            body = md.render(event.payload.comment.body);
            return {
                summaryLine: actorHref + ' commented on ' + issueHref,
                description: body,
            };

        case 'PullRequestEvent':
            prHref = `<a href="${event.payload.pull_request.html_url}" target="_blank">${event.payload.pull_request.title} #${event.payload.pull_request.number}</a>`;
            action = event.payload.action;
            return {
                summaryLine: `${actorHref} ${action} pull request ${prHref} on ${repoHref}`,
                description: "NO DESCRIPTION -> TODO: limit render lines because this is a feed",
            }

        // INFO: below events are identified by AI assistant, but i didn't find them in my feed api
        //      case 'PullRequestEvent':
        //          return 'opened a pull request';
        //      case 'PullRequestReviewCommentEvent':
        //          return 'commented on a pull request';
        //      case 'PullRequestReviewEvent':
        //          return 'reviewed a pull request';
        //      case 'PullRequestReviewThreadEvent':
        //          return 'reviewed a pull request';
        //      case 'PullRequestReviewThreadEvent':
        //          return 'reviewed a pull request';
        default:
            const msg = `Unknown event type: ${eventType}`;
            console.log("================================================================================");
            console.log(msg);
            console.log(event);
            console.log("================================================================================");
            return actorHref + ' triggered ' + eventType;
    }
}

function getAgoTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return `${years} year${years > 1 ? 's' : ''} ago`;
    } else if (months > 0) {
        return `${months} month${months > 1 ? 's' : ''} ago`;
    } else if (weeks > 0) {
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
        return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
    }
}

function processResponse(eventsData) {
    return eventsData.map(event => {

        const actorAvatarUrl = event.actor.avatar_url;

        const agoTime = getAgoTime(event.created_at);

        const r = getOneLineSummaryAndDescription(event)
        const summaryLine = typeof r === 'string' ? r : r.summaryLine;
        const description = typeof r === 'string' ? null : r.description;

        return {
            actorAvatarUrl,
            summaryLine: summaryLine + ' ||  ' + agoTime,
            description: description,
        };
    });
}

function getCacheResponse(username) {
    const filename = `temp.cache.${username}.json`;
    if (fs.existsSync(filename)) {
        const data = fs.readFileSync(filename);
        return JSON.parse(data);
    }
    return null;
}

function saveCacheResponse(username, data) {
    const filename = `temp.cache.${username}.json`;
    fs.writeFileSync(filename, JSON.stringify(data));
}
// Serve the static HTML page
app.use(express.static(path.join(__dirname, 'public')));

// GitHub Events API route for fetching user event data
app.get('/api/events/:username', async (req, res) => {
    const { username } = req.params;

    try {
        const cache = getCacheResponse(username);
        let eventsData;
        if (cache) {
            eventsData = cache;
        } else {
            // Fetching event data from GitHub API
            // /received_events for event user sees, /events for event user triggers
            const response = await axios.get(`https://api.github.com/users/${username}/received_events?page=1&per_page=100`);
            const response2 = await axios.get(`https://api.github.com/users/${username}/received_events?page=2&per_page=100`);
            eventsData = [...response.data, ...response2.data];
            console.log(`Fetched ${eventsData.length} received events for ${username}`);
            saveCacheResponse(username, eventsData);

            // await fs.promises.writeFile('received_events.json', JSON.stringify(eventsData));

            //        const fileContent = await fs.promises.readFile('received_events.json', 'utf8');
            //        const eventsData = JSON.parse(fileContent);
        }


        const processedEvents = processResponse(eventsData);
        res.json(processedEvents);
    } catch (error) {

        console.error(error);
        res.json({ error: 'User events not found or GitHub API error' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
