// js/calendar.js
// ═══════════════════════════════════════════════════════════════════════════
//  Materra Calendar — shared campaign-wide calendar and days traveled
//  13 months × 28 days (4 weeks × 7 days) per month
//  + Aenaris    (Day Out of Time — between Gahen and Akhus, year-end)
//  + Intercalis (Leap Day — between Amarsa and Lotan, every 4th year)
// ═══════════════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  var MONTHS = [
    { num:  1, name: "Akhus",   season: "Winter (Hiver)"          },
    { num:  2, name: "Abzutus", season: "Winter (Hiver)"          },
    { num:  3, name: "Trelus",  season: "Winter (Hiver)"          },
    { num:  4, name: "Sahetru", season: "Between Winter & Spring"  },
    { num:  5, name: "Lahman",  season: "Spring (Len)"            },
    { num:  6, name: "Lahaman", season: "Spring (Len)"            },
    { num:  7, name: "Aeru",    season: "Between Spring & Summer"  },
    { num:  8, name: "Thalsa",  season: "Summer (Sumor)"          },
    { num:  9, name: "Amarsa",  season: "Summer (Sumor)"          },
    { num: 10, name: "Lotan",   season: "Between Summer & Autumn"  },
    { num: 11, name: "Basen",   season: "Autumn (Autumnus)"       },
    { num: 12, name: "Haden",   season: "Autumn (Autumnus)"       },
    { num: 13, name: "Gahen",   season: "Autumn (Autumnus)"       }
  ];

  var WEEKDAYS = [
    { num: 1, scripture: "Lunaris",  common: "Lunis"   },
    { num: 2, scripture: "Thalaris", common: "Thalis"  },
    { num: 3, scripture: "Terranis", common: "Terris"  },
    { num: 4, scripture: "Ignaris",  common: "Ignis"   },
    { num: 5, scripture: "Ventaris", common: "Ventris" },
    { num: 6, scripture: "Aetheris", common: "Aethris" },
    { num: 7, scripture: "Solaris",  common: "Solis"   }
  ];

  var ZODIAC = [
    { sign: "Thalassa",  form: "Sea Seraph"    },
    { sign: "Abzutarus", form: "Void Wyrm"     },
    { sign: "Lotan",     form: "Storm Hydra"   },
    { sign: "Lahmu",     form: "Flow Drake"    },
    { sign: "Lahamu",    form: "Ebb Drake"     },
    { sign: "Hadad",     form: "Thunder Roc"   },
    { sign: "Basmu",     form: "King Viper"    },
    { sign: "Aerie",     form: "White Serpent" },
    { sign: "Gahakan",   form: "Night Weaver"  },
    { sign: "Sahet",     form: "Twin Koi"      },
    { sign: "Trel",      form: "Deep Whale"    },
    { sign: "Akhlys",    form: "Poison Mist"   },
    { sign: "Amaru",     form: "Tide Breaker"  }
  ];

  var DEFAULT_STATE = {
    schemaVersion: 1,
    updatedAt: null,
    calendarDate: {
      year: 4520,
      month: 3,
      day: 28,
      special: null
    },
    daysTraveled: 0
  };

  var CHANNEL_NAME = "mythical-blue-campaign-state-v1";
  var STORAGE_EVENT_KEY = "mythicalBlueCampaignStateBroadcastV1";

  var campaignChannel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;

  var savedState = clone(DEFAULT_STATE);
  var previewDate = clone(DEFAULT_STATE.calendarDate);
  var pollTimer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isLeap(year) {
    return year % 4 === 0;
  }

  function daysInYear(year) {
    return 13 * 28 + 1 + (isLeap(year) ? 1 : 0);
  }

  function getZodiac(year) {
    return ZODIAC[((year - 4519) % 13 + 13) % 13];
  }

  function getWeekday(day) {
    return WEEKDAYS[(day - 1) % 7];
  }

  function ordinal(number) {
    var suffixes = ["th", "st", "nd", "rd"];
    var remainder = number % 100;

    return number + (
      suffixes[(remainder - 20) % 10] ||
      suffixes[remainder] ||
      suffixes[0]
    );
  }

  function weekOccurrence(day) {
    return ["1st", "2nd", "3rd", "Final"][Math.ceil(day / 7) - 1] || "";
  }

  function toAbsolute(date) {
    var absolute = 0;
    var year;
    var month;

    for (year = 1; year < date.year; year++) {
      absolute += daysInYear(year);
    }

    if (date.special === "intercalis") {
      for (month = 1; month <= 9; month++) absolute += 28;
      absolute += 1;
    } else if (date.special === "aenaris") {
      for (month = 1; month <= 13; month++) absolute += 28;
      if (isLeap(date.year)) absolute += 1;
      absolute += 1;
    } else {
      for (month = 1; month < date.month; month++) {
        absolute += 28;
        if (month === 9 && isLeap(date.year)) absolute += 1;
      }

      absolute += date.day;
    }

    return absolute;
  }

  function fromAbsolute(absolute) {
    if (absolute < 1) absolute = 1;

    var remainder = absolute;
    var year = 1;
    var month;

    while (remainder > daysInYear(year)) {
      remainder -= daysInYear(year);
      year++;
    }

    for (month = 1; month <= 13; month++) {
      if (remainder <= 28) {
        return {
          year: year,
          month: month,
          day: remainder,
          special: null
        };
      }

      remainder -= 28;

      if (month === 9 && isLeap(year)) {
        if (remainder === 1) {
          return {
            year: year,
            month: null,
            day: null,
            special: "intercalis"
          };
        }

        remainder--;
      }
    }

    return {
      year: year,
      month: null,
      day: null,
      special: "aenaris"
    };
  }

  function advance(date, delta) {
    return fromAbsolute(toAbsolute(date) + delta);
  }

  function getInfo(date) {
    var zodiac = getZodiac(date.year);

    if (date.special === "intercalis") {
      return {
        isSpecial: true,
        specialName: "Intercalis",
        specialSub: "The Repair of Time",
        year: date.year,
        zodiac: zodiac
      };
    }

    if (date.special === "aenaris") {
      return {
        isSpecial: true,
        specialName: "Aenaris",
        specialSub: "The Day Out of Time",
        year: date.year,
        zodiac: zodiac
      };
    }

    var month = MONTHS[date.month - 1];
    var weekday = getWeekday(date.day);
    var occurrence = weekOccurrence(date.day);

    return {
      isSpecial: false,
      year: date.year,
      zodiac: zodiac,
      season: month.season,
      monthNum: date.month,
      monthName: month.name,
      weekNum: Math.ceil(date.day / 7),
      weekday: weekday,
      day: date.day,
      occurrence: occurrence,
      dayLabel:
        occurrence +
        " " +
        weekday.scripture +
        " of " +
        month.name +
        " (the " +
        ordinal(date.day) +
        ")"
    };
  }

  function setText(id, value) {
    var element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function renderWidget(date) {
    var info = getInfo(date);
    var zodiac = info.zodiac;

    setText("calWidgetYear", info.year + " EM");
    setText("calWidgetSign", "Year of the " + zodiac.form + " · " + zodiac.sign);

    if (info.isSpecial) {
      setText("calWidgetSeason", info.specialSub);
      setText("calWidgetMonthNum", info.specialName);
      setText("calWidgetMonth", "");
      setText("calWidgetWeek", "");
      setText("calWidgetWeekday", "");
      setText("calWidgetDay", "");
      return;
    }

    setText("calWidgetSeason", info.season);
    setText("calWidgetMonthNum", "Month " + info.monthNum);
    setText("calWidgetMonth", info.monthName);
    setText("calWidgetWeek", "Week " + info.weekNum + " of 4");
    setText(
      "calWidgetWeekday",
      info.occurrence + " " + info.weekday.scripture + " · " + info.weekday.common
    );
    setText("calWidgetDay", "the " + ordinal(info.day));
  }

  function renderDaysTraveled(daysTraveled) {
    var normalizedDays = Math.max(0, Number(daysTraveled) || 0);
    var input = document.getElementById("calDaysTraveledInput");

    if (input && document.activeElement !== input) {
      input.value = String(normalizedDays);
    }

    setText("calSheetDaysTraveled", String(normalizedDays));
  }

  function renderSheetBar(date) {
    var element = document.getElementById("calSheetDisplay");

    if (!element) return;

    var info = getInfo(date);
    var zodiac = info.zodiac;

    element.textContent = info.isSpecial
      ? info.year + " EM  ·  " + zodiac.form + " Year  ·  " + info.specialName
      : info.year + " EM  ·  " + zodiac.form + " Year  ·  " + info.dayLabel;
  }

  function renderSavedState() {
    renderWidget(previewDate);
    renderDaysTraveled(savedState.daysTraveled);
    renderSheetBar(savedState.calendarDate);
  }

  function flashButton(button, message) {
    if (!button) return;

    var original = button.textContent;

    button.textContent = message;
    button.disabled = true;

    setTimeout(function () {
      button.textContent = original;
      button.disabled = false;
    }, 1000);
  }

  function publishState(state) {
    var payload = {
      type: "campaign-state-updated",
      state: clone(state),
      nonce: Date.now() + "-" + Math.random()
    };

    try {
      campaignChannel?.postMessage(payload);
    } catch (error) {
      console.warn("Could not broadcast campaign state:", error);
    }

    try {
      localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Could not publish campaign state through localStorage:", error);
    }
  }

  function receiveState(payload) {
    if (!payload || payload.type !== "campaign-state-updated" || !payload.state) {
      return;
    }

    savedState = clone(payload.state);
    previewDate = clone(savedState.calendarDate);
    renderSavedState();
  }

  async function loadLatestState() {
    var state = await global.campaignStateStorage.loadCampaignState();

    savedState = clone(state);
    previewDate = clone(savedState.calendarDate);

    renderSavedState();

    return savedState;
  }

  async function saveState(nextState, button, message) {
    try {
      savedState = await global.campaignStateStorage.saveCampaignState(nextState);
      previewDate = clone(savedState.calendarDate);

      renderSavedState();
      publishState(savedState);
      flashButton(button, message || "Saved ✓");
    } catch (error) {
      console.error(error);
      alert(error.message || "Could not save the shared campaign state.");
    }
  }

  async function changeTraveledDays(delta, button) {
    var currentDays = Number(savedState.daysTraveled) || 0;
    var safeDelta = delta;

    if (delta < 0) {
      safeDelta = -Math.min(Math.abs(delta), currentDays);
    }

    if (!safeDelta) return;

    await saveState(
      {
        ...savedState,
        calendarDate: advance(savedState.calendarDate, safeDelta),
        daysTraveled: currentDays + safeDelta
      },
      button,
      "Updated ✓"
    );
  }

  async function setTraveledDaysTotal(rawValue, input) {
    var currentDays = Number(savedState.daysTraveled) || 0;
    var requestedDays = Math.max(0, Math.floor(Number(rawValue) || 0));
    var delta = requestedDays - currentDays;

    if (!delta) {
      if (input) input.value = String(currentDays);
      return;
    }

    await saveState(
      {
        ...savedState,
        calendarDate: advance(savedState.calendarDate, delta),
        daysTraveled: requestedDays
      },
      input,
      "Updated ✓"
    );
  }

  function schedulePoll() {
    clearTimeout(pollTimer);

    pollTimer = setTimeout(async function () {
      try {
        await loadLatestState();
      } catch {
        // Wait for the next poll.
      }

      schedulePoll();
    }, document.hidden ? 30000 : 5000);
  }

  async function initWidget() {
    var previousButton = document.getElementById("calPrevDay");
    var nextButton = document.getElementById("calNextDay");
    var saveButton = document.getElementById("calSaveDay");

    if (!previousButton) return;

    await global.campaignStateStorage.init();
    await loadLatestState();

    previousButton.addEventListener("click", function () {
      previewDate = advance(previewDate, -1);
      renderWidget(previewDate);
    });

    nextButton.addEventListener("click", function () {
      previewDate = advance(previewDate, 1);
      renderWidget(previewDate);
    });

    saveButton?.addEventListener("click", async function () {
      await saveState(
        {
          ...savedState,
          calendarDate: clone(previewDate)
        },
        saveButton,
        "Saved ✓"
      );
    });

    document
      .getElementById("calTravelMinusMonth")
      ?.addEventListener("click", function (event) {
        // Materra months contain 28 standard days.
        changeTraveledDays(-28, event.currentTarget);
      });

    document
      .getElementById("calTravelMinusWeek")
      ?.addEventListener("click", function (event) {
        changeTraveledDays(-7, event.currentTarget);
      });

    document
      .getElementById("calTravelMinusDay")
      ?.addEventListener("click", function (event) {
        changeTraveledDays(-1, event.currentTarget);
      });

    document
      .getElementById("calTravelAddDay")
      ?.addEventListener("click", function (event) {
        changeTraveledDays(1, event.currentTarget);
      });

    document
      .getElementById("calTravelAddWeek")
      ?.addEventListener("click", function (event) {
        changeTraveledDays(7, event.currentTarget);
      });

    document
      .getElementById("calTravelAddMonth")
      ?.addEventListener("click", function (event) {
        // Materra months contain 28 standard days.
        changeTraveledDays(28, event.currentTarget);
      });

    var daysTraveledInput = document.getElementById("calDaysTraveledInput");

    daysTraveledInput?.addEventListener("change", function () {
      setTraveledDaysTotal(daysTraveledInput.value, daysTraveledInput);
    });

    daysTraveledInput?.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        daysTraveledInput.blur();
      }
    });

    schedulePoll();
  }

  campaignChannel?.addEventListener("message", function (event) {
    receiveState(event.data);
  });

  global.addEventListener("storage", function (event) {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;

    try {
      receiveState(JSON.parse(event.newValue));
    } catch (error) {
      console.warn("Could not parse campaign-state sync event:", error);
    }
  });

  document.addEventListener("visibilitychange", schedulePoll);

  global.renderCalendarOnSheet = function () {
    renderSheetBar(savedState.calendarDate);

    global.campaignStateStorage
      .loadCampaignState()
      .then(function (state) {
        savedState = clone(state);
        previewDate = clone(savedState.calendarDate);
        renderSavedState();
      })
      .catch(function () {
        // Keep the most recently loaded campaign date.
      });
  };

  document.addEventListener("DOMContentLoaded", function () {
    initWidget().catch(function (error) {
      console.error(error);
      alert(error.message || "Could not initialize the shared campaign calendar.");
    });
  });

}(window));


// Refresh the calendar bar whenever the character sheet opens.
(function () {
  const originalShowSheet = showSheet;

  showSheet = function () {
    originalShowSheet();

    if (typeof renderCalendarOnSheet === "function") {
      renderCalendarOnSheet();
    }
  };
})();
