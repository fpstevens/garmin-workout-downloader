(function () {
  if (window.hasRun) {
    return;
  }
  window.hasRun = true;

  const PAGE_SIZE = 20;

  if (!("browser" in self)) {
    self.browser = self.chrome;
  }

  function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  }

  async function fetchActivitiesList(pageSize, start) {
    const url = `https://connect.garmin.com/gc-api/activitylist-service/activities/search/activities?limit=${pageSize}&start=${start}`;
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-GB,en;q=0.5",
        NK: "NT",
        "X-lang": "en-US",
        "DI-Backend": "connectapi.garmin.com",
        "X-Requested-With": "XMLHttpRequest",
        "connect-csrf-token": getCsrfToken(),
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-origin",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
      referrer: "https://connect.garmin.com/modern/activities",
      method: "GET",
      mode: "cors",
    });
    return await response.json();
  }

  async function fetchActivityExerciseSets(activityId) {
    const url = `https://connect.garmin.com/gc-api/activity-service/activity/${activityId}/exerciseSets`;
    const responseJson = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-GB,en;q=0.5",
        NK: "NT",
        "X-lang": "en-US",
        "DI-Backend": "connectapi.garmin.com",
        "X-Requested-With": "XMLHttpRequest",
        "connect-csrf-token": getCsrfToken(),
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-origin",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
      referrer: "https://connect.garmin.com/modern/activities",
      method: "GET",
      mode: "cors",
    })
      .then((resp) => {
        if (resp.ok) return resp.json();
        return {};
      })
      .catch(() => {});
    return responseJson.exerciseSets || [];
  }

  async function fetchActivitySummary(activityId) {
    const url = `https://connect.garmin.com/gc-api/activity-service/activity/${activityId}`;
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-GB,en;q=0.5",
        NK: "NT",
        "X-lang": "en-US",
        "DI-Backend": "connectapi.garmin.com",
        "X-Requested-With": "XMLHttpRequest",
        "connect-csrf-token": getCsrfToken(),
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-origin",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
      referrer: "https://connect.garmin.com/modern/activities",
      method: "GET",
      mode: "cors",
    });
    return await response.json();
  }

  async function enrichAcitvity(activity) {
    activity.fullExerciseSets = [
      ...(await fetchActivityExerciseSets(activity.activityId)),
    ];
    return activity;
  }

  function downloadJsonAsFile(data, filename) {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(data));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `${filename}.json`);
    dlAnchorElem.click();
  }

  // --- Single activity download button ---

  function getActivityIdFromUrl() {
    const match = window.location.pathname.match(/\/activity\/(\d+)/);
    return match ? match[1] : null;
  }

  async function downloadSingleActivity(activityId, button) {
    button.textContent = "Downloading...";
    button.disabled = true;
    try {
      const summary = await fetchActivitySummary(activityId);
      const enriched = await enrichAcitvity(summary);
      await browser.storage.local.set({ workoutData: [enriched] });
      downloadJsonAsFile(enriched, `garmin-activity-${activityId}`);
      button.textContent = "Downloaded!";
      setTimeout(() => {
        button.textContent = "⬇ Download Activity";
        button.disabled = false;
      }, 3000);
    } catch (err) {
      console.error(err);
      button.textContent = "Error!";
      button.disabled = false;
    }
  }

  function injectActivityButton() {
    const activityId = getActivityIdFromUrl();
    if (!activityId) return;
    if (document.getElementById("garmin-dl-btn")) return;

    const btn = document.createElement("button");
    btn.id = "garmin-dl-btn";
    btn.textContent = "⬇ Download Activity";
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      background: #1a7fc1;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    btn.addEventListener("click", () => downloadSingleActivity(activityId, btn));
    document.body.appendChild(btn);
  }

  // Garmin Connect is a SPA so we watch for URL changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(injectActivityButton, 1000);
    }
  }).observe(document.body, { subtree: true, childList: true });

  // Also try on initial load
  setTimeout(injectActivityButton, 1500);

  // --- Bulk download via popup ---

  browser.runtime.onMessage.addListener(async (message) => {
    if (message.command === "fetch") {
      let allActivities = [];
      console.log(`We have ${message.numActivitiesToFetch} activites to fetch`);
      while (allActivities.length < message.numActivitiesToFetch) {
        let activities = await fetchActivitiesList(PAGE_SIZE, allActivities.length)
          .then((activities) => {
            console.debug(`Before extension we have ${activities.length} activities`);
            return Promise.all(activities.map((a) => enrichAcitvity(a)));
          })
          .catch((err) => {
            browser.runtime.sendMessage({ status: "loadingError", error: err });
            console.error(err);
          });
        if (!!activities) {
          console.debug(`After extension we have ${activities.length} activities`);
          allActivities.push(...activities);
          if (activities.length < PAGE_SIZE) break;
        } else {
          break;
        }
      }
      allActivities = allActivities.slice(0, message.numActivitiesToFetch);
      await browser.storage.local.set({ workoutData: allActivities });
      const fileName = `garmin-workouts-${new Date()
        .toISOString()
        .substring(0, 10)}_${message.numActivitiesToFetch}`;
      downloadJsonAsFile(allActivities, fileName);
      browser.runtime.sendMessage({
        status: "loadingSuccess",
        numActivitiesFetched: allActivities.length,
      });
    }
  });
})();