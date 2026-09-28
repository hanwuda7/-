const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = DAY_MS * 7;
const state = {
  data: null,
  selectedWeek: 1,
  selectedWeekday: 1,
  conflicts: [],
  touchStart: null,
  toastTimer: null,
  deferredInstallPrompt: null,
};

const elements = {
  semesterTitle: document.querySelector("#semesterTitle"),
  weekHeading: document.querySelector("#weekHeading"),
  dateRange: document.querySelector("#dateRange"),
  termStatus: document.querySelector("#termStatus"),
  previousWeek: document.querySelector("#previousWeek"),
  nextWeek: document.querySelector("#nextWeek"),
  todayButton: document.querySelector("#todayButton"),
  nextClass: document.querySelector("#nextClass"),
  weekStrip: document.querySelector("#weekStrip"),
  dayHeading: document.querySelector("#dayHeading"),
  dayDate: document.querySelector("#dayDate"),
  schedulePanel: document.querySelector("#schedulePanel"),
  scheduleList: document.querySelector("#scheduleList"),
  dataNotice: document.querySelector("#dataNotice"),
  noticeCount: document.querySelector("#noticeCount"),
  noticeContent: document.querySelector("#noticeContent"),
  conflictSummary: document.querySelector("#conflictSummary"),
  courseDialog: document.querySelector("#courseDialog"),
  dialogCourseName: document.querySelector("#dialogCourseName"),
  dialogContent: document.querySelector("#dialogContent"),
  closeDialog: document.querySelector("#closeDialog"),
  installButton: document.querySelector("#installButton"),
  toast: document.querySelector("#toast"),
};

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addWeeks(date, weeks) {
  return addDays(date, weeks * 7);
}

function getTimeOnDate(date, timeText) {
  const [hours, minutes] = timeText.split(":").map(Number);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes
  );
}

function getWeekForDate(date) {
  const start = parseLocalDate(state.data.meta.termStart);
  const diff = startOfDay(date).getTime() - start.getTime();
  return Math.floor(diff / WEEK_MS) + 1;
}

function getDateForWeekday(week, weekday) {
  const start = parseLocalDate(state.data.meta.termStart);
  return addDays(start, (week - 1) * 7 + weekday - 1);
}

function clampWeek(week) {
  return Math.min(Math.max(week, 1), state.data.meta.totalWeeks);
}

function isDateInTerm(date) {
  const target = startOfDay(date);
  const start = parseLocalDate(state.data.meta.termStart);
  const end = parseLocalDate(state.data.meta.termEnd);
  return target >= start && target <= end;
}

function getTermStatus() {
  const today = startOfDay(new Date());
  const start = parseLocalDate(state.data.meta.termStart);
  const end = parseLocalDate(state.data.meta.termEnd);

  if (today < start) {
    return {
      key: "before",
      label: "学期尚未开始",
      detail: `距离开课还有 ${Math.ceil((start - today) / DAY_MS)} 天`,
    };
  }

  if (today > end) {
    return {
      key: "ended",
      label: "本学期已结束",
      detail: "课程已自动停止显示",
    };
  }

  return {
    key: "active",
    label: "当前学期",
    detail: "",
  };
}

function getCurrentWeek() {
  return clampWeek(getWeekForDate(new Date()));
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatShortMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatWeekday(date) {
  return state.data.dayNames[date.getDay() === 0 ? 6 : date.getDay() - 1];
}

function formatDateRange(startDate) {
  const endDate = addDays(startDate, 6);
  return `${formatMonthDay(startDate)} — ${formatMonthDay(endDate)}`;
}

function findPeriod(periodId) {
  return state.data.periods.find((period) => period.id === periodId);
}

function getPeriodRange(periodIds) {
  const first = findPeriod(Math.min(...periodIds));
  const last = findPeriod(Math.max(...periodIds));
  return {
    start: first?.start || "待确认",
    end: last?.end || "待确认",
    label: periodIds.length === 1
      ? `第${periodIds[0]}节`
      : `第${Math.min(...periodIds)}-${Math.max(...periodIds)}节`,
  };
}

function getPeriodGroup(periodIds) {
  return state.data.periodGroups.find((group) =>
    periodIds.every((periodId) => group.periods.includes(periodId))
  );
}

function isCourseActive(course, date, now = new Date()) {
  if (!isDateInTerm(date)) {
    return false;
  }

  const today = startOfDay(new Date());
  if (startOfDay(date).getTime() !== today.getTime()) {
    return false;
  }

  const range = getPeriodRange(course.periods);
  const start = getTimeOnDate(date, range.start);
  const end = getTimeOnDate(date, range.end);
  return now >= start && now <= end;
}

function coursesFor(weekday, week) {
  return state.data.courses
    .filter(
      (course) =>
        course.weekday === weekday &&
        course.weeks.includes(week)
    )
    .sort((a, b) => Math.min(...a.periods) - Math.min(...b.periods));
}

function detectConflicts() {
  const conflicts = [];
  const courses = state.data.courses;

  for (let firstIndex = 0; firstIndex < courses.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < courses.length;
      secondIndex += 1
    ) {
      const first = courses[firstIndex];
      const second = courses[secondIndex];

      if (first.weekday !== second.weekday) {
        continue;
      }

      const sharedWeeks = first.weeks.filter((week) =>
        second.weeks.includes(week)
      );
      const sharedPeriods = first.periods.filter((period) =>
        second.periods.includes(period)
      );

      if (sharedWeeks.length > 0 && sharedPeriods.length > 0) {
        conflicts.push({
          first,
          second,
          weeks: sharedWeeks,
          periods: sharedPeriods,
        });
      }
    }
  }

  return conflicts;
}

function getConflictsForCourse(courseId) {
  return state.conflicts.filter(
    (conflict) =>
      conflict.first.id === courseId || conflict.second.id === courseId
  );
}

function renderHeader() {
  const status = getTermStatus();
  const startDate = getDateForWeekday(state.selectedWeek, 1);
  const selectedDate = getDateForWeekday(
    state.selectedWeek,
    state.selectedWeekday
  );

  elements.semesterTitle.textContent = state.data.meta.semester;
  elements.termStatus.textContent = status.label;
  elements.weekHeading.textContent = `第 ${state.selectedWeek} 周`;
  elements.dateRange.textContent = formatDateRange(startDate);
  elements.dayHeading.textContent = state.data.dayNames[state.selectedWeekday - 1];
  elements.dayDate.textContent = `${formatMonthDay(selectedDate)} · ${formatWeekday(selectedDate)}`;

  elements.previousWeek.disabled = state.selectedWeek <= 1;
  elements.nextWeek.disabled = state.selectedWeek >= state.data.meta.totalWeeks;
  elements.todayButton.textContent =
    state.selectedWeek === getCurrentWeek() ? "回到本周" : "回到本周";
}

function renderWeekStrip() {
  elements.weekStrip.replaceChildren();
  const todayWeek = getCurrentWeek();
  const todayWeekday = new Date().getDay() === 0 ? 7 : new Date().getDay();

  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const date = getDateForWeekday(state.selectedWeek, weekday);
    const courses = coursesFor(weekday, state.selectedWeek);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-tab";
    button.setAttribute("aria-label", `${state.data.dayNames[weekday - 1]}，${formatMonthDay(date)}，${courses.length}节课`);

    if (weekday === state.selectedWeekday) {
      button.classList.add("is-selected");
    }

    if (state.selectedWeek === todayWeek && weekday === todayWeekday) {
      button.classList.add("is-today");
    }

    button.innerHTML = `
      <span class="day-tab-weekday">${state.data.dayNames[weekday - 1].replace("星期", "周")}</span>
      <span class="day-tab-date">${date.getDate()}</span>
      <span class="day-tab-count">${courses.length ? `${courses.length}节` : " "}</span>
    `;

    button.addEventListener("click", () => {
      state.selectedWeekday = weekday;
      render();
    });

    elements.weekStrip.append(button);
  }
}

function createCourseCard(course, date) {
  const range = getPeriodRange(course.periods);
  const conflicts = getConflictsForCourse(course.id);
  const active = isCourseActive(course, date);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "course-card";
  card.style.setProperty("--course-color", course.color || "#0f5d68");

  if (active) {
    card.classList.add("is-current");
  }

  card.innerHTML = `
    <span class="course-title-row">
      <span class="course-name">${course.name}</span>
      ${active ? '<span class="current-pill">正在上课</span>' : ""}
    </span>
    <span class="course-meta">
      <span class="course-meta-line"><strong>教师</strong> ${course.teacher}</span>
      <span class="course-meta-line"><strong>教室</strong> ${course.location}</span>
      <span class="course-meta-line"><strong>节次</strong> ${range.label} · ${range.start}-${range.end}</span>
      <span class="course-meta-line">
        ${conflicts.length ? '<span class="conflict-mark">冲突</span>' : ""}
        <strong>周次</strong> ${course.rawWeeks || `第${course.weeks.join("、")}周`}
      </span>
    </span>
  `;

  card.addEventListener("click", () => openCourseDialog(course));
  return card;
}

function renderTimeline() {
  elements.scheduleList.replaceChildren();
  const status = getTermStatus();
  const date = getDateForWeekday(state.selectedWeek, state.selectedWeekday);
  const courses = status.key === "active" ? coursesFor(state.selectedWeekday, state.selectedWeek) : [];

  if (status.key !== "active") {
    const message = document.createElement("div");
    message.className = "empty-slot";
    message.textContent =
      status.key === "before"
        ? `学期尚未开始，${status.detail}。`
        : "本学期已结束，课程已自动停止显示。";
    elements.scheduleList.append(message);
    return;
  }

  state.data.periodGroups.forEach((group) => {
    const matchingCourses = courses.filter((course) => {
      const courseGroup = getPeriodGroup(course.periods);
      return courseGroup?.id === group.id;
    });
    const slot = document.createElement("article");
    slot.className = "time-slot";

    const firstPeriod = findPeriod(group.periods[0]);
    const lastPeriod = findPeriod(group.periods[group.periods.length - 1]);

    slot.innerHTML = `
      <div class="slot-time">
        ${group.label}
        <span>${firstPeriod.start}-${lastPeriod.end}</span>
      </div>
      <div class="slot-courses"></div>
    `;

    const slotCourses = slot.querySelector(".slot-courses");

    if (matchingCourses.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-slot";
      empty.textContent = "无课";
      slotCourses.append(empty);
    } else {
      matchingCourses.forEach((course) => {
        slotCourses.append(createCourseCard(course, date));
      });
    }

    elements.scheduleList.append(slot);
  });
}

function getNextClass() {
  const now = new Date();
  const status = getTermStatus();

  if (status.key !== "active") {
    return null;
  }

  const currentWeek = getCurrentWeek();

  for (let week = currentWeek; week <= state.data.meta.totalWeeks; week += 1) {
    const candidates = state.data.courses
      .filter((course) => course.weeks.includes(week))
      .map((course) => {
        const date = getDateForWeekday(week, course.weekday);
        const range = getPeriodRange(course.periods);
        return {
          course,
          date,
          start: getTimeOnDate(date, range.start),
          end: getTimeOnDate(date, range.end),
        };
      })
      .filter((item) => item.start > now)
      .sort((first, second) => first.start - second.start);

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
}

function formatCountdown(milliseconds) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));

  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} 天 ${remainingHours} 小时` : `${days} 天`;
}

function findCurrentClass() {
  const now = new Date();
  const currentWeek = getCurrentWeek();
  const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();
  const date = getDateForWeekday(currentWeek, todayWeekday);

  return coursesFor(todayWeekday, currentWeek).find((course) =>
    isCourseActive(course, date, now)
  );
}

function renderNextClass() {
  const status = getTermStatus();

  if (status.key !== "active") {
    elements.nextClass.textContent =
      status.key === "before"
        ? `学期尚未开始，${status.detail}。`
        : "本学期已结束，课程已自动停止显示。";
    return;
  }

  const currentClass = findCurrentClass();
  const nextClass = getNextClass();

  if (currentClass) {
    const currentWeek = getCurrentWeek();
    const date = getDateForWeekday(
      currentWeek,
      currentClass.weekday
    );
    const range = getPeriodRange(currentClass.periods);
    const end = getTimeOnDate(date, range.end);

    if (nextClass) {
      elements.nextClass.textContent = `正在上课：${currentClass.name}，还有 ${formatCountdown(end - new Date())} 下课；下一节 ${nextClass.course.name} 在 ${formatMonthDay(nextClass.date)} ${nextClass.start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    } else {
      elements.nextClass.textContent = `正在上课：${currentClass.name}，还有 ${formatCountdown(end - new Date())} 下课`;
    }
    return;
  }

  if (!nextClass) {
    elements.nextClass.textContent = "本学期暂无后续课程。";
    return;
  }

  elements.nextClass.textContent = `下一节：${nextClass.course.name} · ${formatMonthDay(nextClass.date)} ${formatWeekday(nextClass.date)} ${nextClass.start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · 还有 ${formatCountdown(nextClass.start - new Date())}`;
}

function renderNotice() {
  const items = state.data.meta.unverified || [];
  elements.noticeCount.textContent = `${items.length} 项说明`;
  elements.noticeContent.replaceChildren();

  items.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "notice-item";
    wrapper.innerHTML = `
      <strong>${item.scope} · ${item.status}</strong>
      <p>${item.detail}</p>
    `;
    elements.noticeContent.append(wrapper);
  });
}

function renderConflictSummary() {
  if (state.conflicts.length === 0) {
    elements.conflictSummary.textContent = "冲突检测：未发现课程冲突";
    return;
  }

  elements.conflictSummary.textContent = `冲突检测：发现 ${state.conflicts.length} 处课程冲突`;
}

function openCourseDialog(course) {
  const range = getPeriodRange(course.periods);
  const conflicts = getConflictsForCourse(course.id);
  const conflictText = conflicts.length
    ? conflicts
        .map((conflict) => {
          const other =
            conflict.first.id === course.id
              ? conflict.second
              : conflict.first;
          return `与“${other.name}”在第${conflict.weeks.join("、")}周、第${conflict.periods.join("、")}节重叠`;
        })
        .join("；")
    : "";

  elements.dialogCourseName.textContent = course.name;
  elements.dialogContent.innerHTML = `
    <div class="detail-row">
      <span class="detail-label">教师</span>
      <p class="detail-value">${course.teacher}</p>
    </div>
    <div class="detail-row">
      <span class="detail-label">教室</span>
      <p class="detail-value">${course.location}</p>
    </div>
    <div class="detail-row">
      <span class="detail-label">星期</span>
      <p class="detail-value">${state.data.dayNames[course.weekday - 1]}</p>
    </div>
    <div class="detail-row">
      <span class="detail-label">节次</span>
      <p class="detail-value">${range.label}（${range.start}-${range.end}）</p>
    </div>
    <div class="detail-row">
      <span class="detail-label">上课周数</span>
      <p class="detail-value">${course.rawWeeks || `第${course.weeks.join("、")}周`}</p>
    </div>
    <div class="detail-row">
      <span class="detail-label">来源</span>
      <p class="detail-value">${course.sourceWeeks || state.data.meta.source}</p>
    </div>
    ${
      course.note
        ? `<div class="detail-row">
            <span class="detail-label">说明</span>
            <p class="detail-value">${course.note}</p>
          </div>`
        : ""
    }
    ${
      conflictText
        ? `<p class="dialog-warning dialog-conflict">课程冲突：${conflictText}</p>`
        : ""
    }
    <p class="dialog-warning">节次起止时间未在原课表中给出，当前显示时间属于待确认信息。</p>
  `;

  if (typeof elements.courseDialog.showModal === "function") {
    elements.courseDialog.showModal();
  } else {
    elements.courseDialog.setAttribute("open", "");
  }
}

function closeCourseDialog() {
  if (typeof elements.courseDialog.close === "function") {
    elements.courseDialog.close();
  } else {
    elements.courseDialog.removeAttribute("open");
  }
}

function changeWeek(delta) {
  const nextWeek = clampWeek(state.selectedWeek + delta);

  if (nextWeek === state.selectedWeek) {
    return;
  }

  state.selectedWeek = nextWeek;
  render();
}

function goToCurrentWeek() {
  const today = new Date();
  state.selectedWeek = getCurrentWeek();
  state.selectedWeekday = today.getDay() === 0 ? 7 : today.getDay();
  render();
  showToast("已回到本周");
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 1800);
}

function bindSwipe() {
  elements.schedulePanel.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      state.touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    },
    { passive: true }
  );

  elements.schedulePanel.addEventListener(
    "touchend",
    (event) => {
      if (!state.touchStart) {
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - state.touchStart.x;
      const deltaY = touch.clientY - state.touchStart.y;
      const elapsed = Date.now() - state.touchStart.time;
      state.touchStart = null;

      if (
        elapsed > 650 ||
        Math.abs(deltaX) < 52 ||
        Math.abs(deltaX) < Math.abs(deltaY) * 1.25
      ) {
        return;
      }

      changeWeek(deltaX < 0 ? 1 : -1);
    },
    { passive: true }
  );
}

function render() {
  renderHeader();
  renderWeekStrip();
  renderTimeline();
  renderNextClass();
}

function bindEvents() {
  elements.previousWeek.addEventListener("click", () => changeWeek(-1));
  elements.nextWeek.addEventListener("click", () => changeWeek(1));
  elements.todayButton.addEventListener("click", goToCurrentWeek);
  elements.closeDialog.addEventListener("click", closeCourseDialog);
  elements.courseDialog.addEventListener("click", (event) => {
    if (event.target === elements.courseDialog) {
      closeCourseDialog();
    }
  });

  bindSwipe();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) {
      showToast("请在浏览器菜单中选择“添加到主屏幕”");
      return;
    }

    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
}

async function loadData() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    try {
      const response = await fetch("./courses.json", { cache: "no-cache" });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn("courses.json 读取失败，将使用离线数据副本。", error);
    }
  }

  if (window.COURSE_DATA) {
    return window.COURSE_DATA;
  }

  throw new Error("没有读取到课程数据。");
}

async function registerServiceWorker() {
  if (
    "serviceWorker" in navigator &&
    (window.location.protocol === "http:" || window.location.protocol === "https:")
  ) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.warn("Service Worker 注册失败。", error);
    }
  }
}

async function init() {
  try {
    state.data = await loadData();
    state.selectedWeek = getCurrentWeek();
    const today = new Date();
    state.selectedWeekday = today.getDay() === 0 ? 7 : today.getDay();
    state.conflicts = detectConflicts();

    renderNotice();
    renderConflictSummary();
    bindEvents();
    render();
    registerServiceWorker();

    window.setInterval(() => {
      renderNextClass();
      renderTimeline();
    }, 60 * 1000);
  } catch (error) {
    console.error(error);
    elements.weekHeading.textContent = "加载失败";
    elements.nextClass.textContent =
      "请通过本地服务器打开，或确认 courses.json 与 data/courses.data.js 文件存在。";
    elements.scheduleList.innerHTML =
      '<div class="empty-slot">课程数据读取失败。请查看 README.md 中的运行说明。</div>';
  }
}

init();
