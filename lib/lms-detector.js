(function () {
  // Host patterns for popular LMS platforms plus your explicit MSU Lite domain.
  const HOST_KEYWORDS = [
    "canvas",
    "instructure",
    "d2l",
    "brightspace",
    "blackboard",
    "moodle",
    "schoology",
    "lite.msu.edu",
    "webwork",
    "loncapa",
    "lon-capa",
    "connect.mheducation",
    "mheducation.com",
    "mcgrawhill",
    "mhconnect"
  ];

  const PATH_KEYWORDS = [
    "assignments",
    "assignment",
    "homework",
    "set",
    "problem",
    "quizzes",
    "coursework",
    "grades",
    "calendar",
    "webwork2",
    "lon-capa",
    "connect",
    "student/class",
    "student/todo",
    "student/calendar"
  ];

  function isLikelyLmsUrl(urlString) {
    try {
      const url = new URL(urlString);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();

      const hostMatch = HOST_KEYWORDS.some((keyword) => host.includes(keyword));
      const pathMatch = PATH_KEYWORDS.some((keyword) => path.includes(keyword));

      return hostMatch || pathMatch;
    } catch (error) {
      return false;
    }
  }

  window.LMSDetector = {
    isLikelyLmsUrl
  };
})();
