"use strict";

/* ============================================
   CONFIGURATION
============================================ */

mapboxgl.accessToken =
    "pk.eyJ1IjoiYXZlcnllam9obnMiLCJhIjoiY21uNmo3YnNiMDZrYTJwcTFwcHRzOG83NCJ9.aFx3CE9PzNOHSiDO7cEf2g";

const CASE_DATA_PATH =
    "data/01_master_case_files/01_cases_master_cleaned_FIXED.csv";

const RECORDS_PER_PAGE = 18;


/* ============================================
   APPLICATION STATE
============================================ */

let allCases = [];
let filteredCases = [];
let currentPage = 1;

let directoryMap = null;
let activePopup = null;


/* ============================================
   PAGE ELEMENTS
============================================ */

const searchInput =
    document.getElementById("directory-search-input");

const searchButton =
    document.getElementById("directory-search-button");

const clearSearchButton =
    document.getElementById("clear-search-button");

const noResultsClearButton =
    document.getElementById("no-results-clear-button");

const caseTypeFilter =
    document.getElementById("directory-case-type-filter");

const statusFilter =
    document.getElementById("directory-status-filter");

const yearFilter =
    document.getElementById("directory-year-filter");

const identityFilter =
    document.getElementById("directory-identity-filter");

const sortSelect =
    document.getElementById("directory-sort");

const caseGrid =
    document.getElementById("case-directory-grid");

const resultsCount =
    document.getElementById("results-count");

const loadingStatus =
    document.getElementById("directory-loading-status");

const loadingMessage =
    document.getElementById("directory-loading-message");

const noResultsMessage =
    document.getElementById("no-results-message");

const errorMessage =
    document.getElementById("directory-error-message");

const errorText =
    document.getElementById("directory-error-text");

const activeFilterRow =
    document.getElementById("active-filter-row");

const activeFilterList =
    document.getElementById("active-filter-list");

const pagination =
    document.getElementById("directory-pagination");

const previousPageButton =
    document.getElementById("previous-page-button");

const nextPageButton =
    document.getElementById("next-page-button");

const paginationStatus =
    document.getElementById("pagination-status");

const mapLoading =
    document.getElementById("directory-map-loading");

const mapStatus =
    document.getElementById("directory-map-status");


/* ============================================
   GENERAL HELPERS
============================================ */

function cleanValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    const cleaned = String(value).trim();

    if (
        cleaned.toLowerCase() === "nan" ||
        cleaned.toLowerCase() === "null" ||
        cleaned.toLowerCase() === "undefined"
    ) {
        return "";
    }

    return cleaned;
}


function escapeHTML(value) {
    return cleanValue(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function normalizeText(value) {
    return cleanValue(value).toLowerCase();
}


function displayFallback(value, fallback = "Not publicly documented") {
    const cleaned = cleanValue(value);
    return cleaned || fallback;
}


function parseCoordinate(value) {
    const coordinate = Number.parseFloat(cleanValue(value));

    return Number.isFinite(coordinate)
        ? coordinate
        : null;
}


function parseBoolean(value) {
    const normalized = normalizeText(value);

    return [
        "true",
        "yes",
        "1",
        "y"
    ].includes(normalized);
}


function truncateText(value, maximumLength = 210) {
    const text = cleanValue(value);

    if (!text) {
        return "Additional public case information is not currently available.";
    }

    if (text.length <= maximumLength) {
        return text;
    }

    return `${text.slice(0, maximumLength).trim()}…`;
}


/* ============================================
   CASE FIELD HELPERS
============================================ */

function getCaseName(caseRecord) {
    return (
        cleanValue(caseRecord.display_name) ||
        [
            cleanValue(caseRecord.first_name),
            cleanValue(caseRecord.last_name)
        ]
            .filter(Boolean)
            .join(" ") ||
        cleanValue(caseRecord.normalized_name) ||
        "Unnamed case record"
    );
}


function getCaseYear(caseRecord) {
    const yearLastSeen =
        cleanValue(caseRecord.year_last_seen);

    if (yearLastSeen) {
        return yearLastSeen;
    }

    const lastSeenDate =
        cleanValue(caseRecord.date_last_seen);

    if (lastSeenDate) {
        const yearMatch =
            lastSeenDate.match(/\b(19|20)\d{2}\b/);

        if (yearMatch) {
            return yearMatch[0];
        }
    }

    const bodyFoundDate =
        cleanValue(caseRecord.date_body_found);

    if (bodyFoundDate) {
        const yearMatch =
            bodyFoundDate.match(/\b(19|20)\d{2}\b/);

        if (yearMatch) {
            return yearMatch[0];
        }
    }

    return "";
}


function getCaseLocation(caseRecord) {
    return (
        cleanValue(caseRecord.geocoded_address) ||
        cleanValue(caseRecord.raw_address) ||
        cleanValue(caseRecord.location_found) ||
        [
            cleanValue(caseRecord.city),
            cleanValue(caseRecord.state)
        ]
            .filter(Boolean)
            .join(", ")
    );
}


function getCaseType(caseRecord) {
    return (
        cleanValue(caseRecord.case_type) ||
        cleanValue(caseRecord.victim_type) ||
        "Case record"
    );
}


function getCaseStatus(caseRecord) {
    return (
        cleanValue(caseRecord.case_status) ||
        cleanValue(caseRecord.outcome) ||
        "Status unavailable"
    );
}


function getRecordURL(caseRecord) {
    const caseID = cleanValue(caseRecord.case_id);

    if (!caseID) {
        return "case.html";
    }

    return `case.html?id=${encodeURIComponent(caseID)}`;
}


function isMappableCase(caseRecord) {
    const latitude =
        parseCoordinate(caseRecord.latitude);

    const longitude =
        parseCoordinate(caseRecord.longitude);

    const coordinatesAreValid =
        latitude !== null &&
        longitude !== null &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180;

    if (!coordinatesAreValid) {
        return false;
    }

    const usableValue =
        cleanValue(caseRecord.usable_for_mapping);

    /*
     * Some CSV exports may leave this field blank even
     * when usable coordinates are present.
     */
    if (!usableValue) {
        return true;
    }

    return parseBoolean(usableValue);
}


/* ============================================
   LOAD CSV
============================================ */

function loadCaseDirectory() {
    if (typeof Papa === "undefined") {
        showDataError(
            "The CSV parsing library did not load."
        );

        return;
    }

    Papa.parse(CASE_DATA_PATH, {
        download: true,
        header: true,
        skipEmptyLines: true,

        complete(results) {
            if (results.errors.length > 0) {
                console.warn(
                    "CSV parsing warnings:",
                    results.errors
                );
            }

            allCases = results.data.filter((caseRecord) => {
                return Object.values(caseRecord).some((value) => {
                    return cleanValue(value);
                });
            });

            initializeDirectory();
        },

        error(error) {
            console.error(
                "Case directory loading error:",
                error
            );

            showDataError(
                `The database file could not be loaded from ${CASE_DATA_PATH}.`
            );
        }
    });
}


/* ============================================
   INITIALIZATION
============================================ */

function initializeDirectory() {
    populateFilters();

    initializeMap();

    const parameters =
        new URLSearchParams(window.location.search);

    const initialSearch =
        cleanValue(parameters.get("search"));

    if (initialSearch) {
        searchInput.value = initialSearch;
    }

    loadingMessage.hidden = true;
    caseGrid.setAttribute("aria-busy", "false");

    applyFilters();
}


/* ============================================
   FILTER OPTIONS
============================================ */

function getUniqueValues(columnName) {
    return [
        ...new Set(
            allCases
                .map((caseRecord) => {
                    return cleanValue(
                        caseRecord[columnName]
                    );
                })
                .filter(Boolean)
        )
    ];
}


function addOptions(selectElement, values) {
    values.forEach((value) => {
        const option =
            document.createElement("option");

        option.value = value;
        option.textContent = value;

        selectElement.appendChild(option);
    });
}


function populateFilters() {
    const caseTypes =
        getUniqueValues("case_type")
            .sort((a, b) => a.localeCompare(b));

    const statuses =
        getUniqueValues("case_status")
            .sort((a, b) => a.localeCompare(b));

    const identityStatuses =
        getUniqueValues("identity_status")
            .sort((a, b) => a.localeCompare(b));

    const years = [
        ...new Set(
            allCases
                .map(getCaseYear)
                .filter(Boolean)
        )
    ].sort((a, b) => Number(b) - Number(a));

    addOptions(caseTypeFilter, caseTypes);
    addOptions(statusFilter, statuses);
    addOptions(yearFilter, years);
    addOptions(identityFilter, identityStatuses);
}


/* ============================================
   SEARCH AND FILTERING
============================================ */

function caseMatchesSearch(caseRecord, searchTerm) {
    if (!searchTerm) {
        return true;
    }

    const searchableFields = [
        caseRecord.display_name,
        caseRecord.first_name,
        caseRecord.last_name,
        caseRecord.normalized_name,
        caseRecord.case_id,
        caseRecord.namus_id,
        caseRecord.identity_status,
        caseRecord.case_type,
        caseRecord.victim_type,
        caseRecord.case_status,
        caseRecord.outcome,
        caseRecord.date_last_seen,
        caseRecord.date_body_found,
        caseRecord.year_last_seen,
        caseRecord.raw_address,
        caseRecord.geocoded_address,
        caseRecord.city,
        caseRecord.state,
        caseRecord.location_found,
        caseRecord.cause_of_death,
        caseRecord.case_summary
    ];

    const searchableText =
        searchableFields
            .map(cleanValue)
            .join(" ")
            .toLowerCase();

    return searchableText.includes(searchTerm);
}


function applyFilters() {
    const searchTerm =
        normalizeText(searchInput.value);

    const selectedCaseType =
        normalizeText(caseTypeFilter.value);

    const selectedStatus =
        normalizeText(statusFilter.value);

    const selectedYear =
        normalizeText(yearFilter.value);

    const selectedIdentity =
        normalizeText(identityFilter.value);

    filteredCases = allCases.filter((caseRecord) => {
        const matchesSearch =
            caseMatchesSearch(caseRecord, searchTerm);

        const matchesCaseType =
            !selectedCaseType ||
            normalizeText(caseRecord.case_type) ===
                selectedCaseType;

        const matchesStatus =
            !selectedStatus ||
            normalizeText(caseRecord.case_status) ===
                selectedStatus;

        const matchesYear =
            !selectedYear ||
            normalizeText(getCaseYear(caseRecord)) ===
                selectedYear;

        const matchesIdentity =
            !selectedIdentity ||
            normalizeText(caseRecord.identity_status) ===
                selectedIdentity;

        return (
            matchesSearch &&
            matchesCaseType &&
            matchesStatus &&
            matchesYear &&
            matchesIdentity
        );
    });

    sortCases();

    currentPage = 1;

    updateURL();
    updateActiveFilters();
    renderDirectory();
}


/* ============================================
   SORTING
============================================ */

function sortCases() {
    const sortValue = sortSelect.value;

    filteredCases.sort((caseA, caseB) => {
        const nameA =
            getCaseName(caseA).toLowerCase();

        const nameB =
            getCaseName(caseB).toLowerCase();

        const yearA =
            Number(getCaseYear(caseA)) || 0;

        const yearB =
            Number(getCaseYear(caseB)) || 0;

        switch (sortValue) {
            case "name-desc":
                return nameB.localeCompare(nameA);

            case "year-desc":
                return yearB - yearA;

            case "year-asc":
                return yearA - yearB;

            case "name-asc":
            default:
                return nameA.localeCompare(nameB);
        }
    });
}


/* ============================================
   URL SEARCH PARAMETER
============================================ */

function updateURL() {
    const searchTerm =
        cleanValue(searchInput.value);

    const url =
        new URL(window.location.href);

    if (searchTerm) {
        url.searchParams.set("search", searchTerm);
    } else {
        url.searchParams.delete("search");
    }

    window.history.replaceState(
        {},
        "",
        url
    );
}


/* ============================================
   ACTIVE FILTER DISPLAY
============================================ */

function createActiveFilter(label, value) {
    const filter =
        document.createElement("span");

    filter.className = "active-filter-chip";
    filter.textContent = `${label}: ${value}`;

    return filter;
}


function updateActiveFilters() {
    activeFilterList.innerHTML = "";

    const activeFilters = [];

    const searchTerm =
        cleanValue(searchInput.value);

    if (searchTerm) {
        activeFilters.push([
            "Search",
            searchTerm
        ]);
    }

    if (caseTypeFilter.value) {
        activeFilters.push([
            "Case type",
            caseTypeFilter.value
        ]);
    }

    if (statusFilter.value) {
        activeFilters.push([
            "Status",
            statusFilter.value
        ]);
    }

    if (yearFilter.value) {
        activeFilters.push([
            "Year",
            yearFilter.value
        ]);
    }

    if (identityFilter.value) {
        activeFilters.push([
            "Identity",
            identityFilter.value
        ]);
    }

    activeFilters.forEach(([label, value]) => {
        activeFilterList.appendChild(
            createActiveFilter(label, value)
        );
    });

    activeFilterRow.hidden =
        activeFilters.length === 0;
}


/* ============================================
   CASE CARDS
============================================ */

function createCaseCard(caseRecord, recordNumber) {
    const article =
        document.createElement("article");

    article.className = "case-card";

    const caseID =
        displayFallback(
            caseRecord.case_id,
            `RECORD-${recordNumber}`
        );

    article.dataset.caseId =
        cleanValue(caseRecord.case_id);

    const name =
        getCaseName(caseRecord);

    const age =
        displayFallback(
            caseRecord.age_at_event,
            "Unknown"
        );

    const year =
        displayFallback(
            getCaseYear(caseRecord),
            "Unknown"
        );

    const location =
        displayFallback(
            getCaseLocation(caseRecord)
        );

    const caseType =
        getCaseType(caseRecord);

    const status =
        getCaseStatus(caseRecord);

    const identityStatus =
        cleanValue(caseRecord.identity_status);

    const summary =
        truncateText(caseRecord.case_summary);

    const recordURL =
        getRecordURL(caseRecord);

    article.innerHTML = `
        <div class="case-card-header">

            <p class="case-card-id">
                ${escapeHTML(caseID)}
            </p>

            <span class="case-card-index">
                ${String(recordNumber).padStart(3, "0")}
            </span>

        </div>

        <div class="case-card-title">

            <p class="case-card-type">
                ${escapeHTML(caseType)}
            </p>

            <h3>
                ${escapeHTML(name)}
            </h3>

        </div>

        <div class="case-card-status-row">

            <span class="case-status">
                ${escapeHTML(status)}
            </span>

            ${
                identityStatus
                    ? `
                        <span class="identity-status">
                            ${escapeHTML(identityStatus)}
                        </span>
                    `
                    : ""
            }

        </div>

        <dl class="case-card-metadata">

            <div>
                <dt>AGE AT EVENT</dt>
                <dd>${escapeHTML(age)}</dd>
            </div>

            <div>
                <dt>YEAR</dt>
                <dd>${escapeHTML(year)}</dd>
            </div>

            <div class="case-location-field">
                <dt>DOCUMENTED LOCATION</dt>
                <dd>${escapeHTML(location)}</dd>
            </div>

        </dl>

        <p class="case-card-summary">
            ${escapeHTML(summary)}
        </p>

        <a
            href="${recordURL}"
            class="case-card-link"
        >
            VIEW CASE RECORD →
        </a>
    `;

    article.addEventListener("mouseenter", () => {
        highlightMapCase(caseRecord);
    });

    article.addEventListener("focusin", () => {
        highlightMapCase(caseRecord);
    });

    return article;
}


function renderCaseCards() {
    caseGrid.innerHTML = "";

    const startIndex =
        (currentPage - 1) * RECORDS_PER_PAGE;

    const endIndex =
        startIndex + RECORDS_PER_PAGE;

    const pageCases =
        filteredCases.slice(startIndex, endIndex);

    pageCases.forEach((caseRecord, index) => {
        const recordNumber =
            startIndex + index + 1;

        caseGrid.appendChild(
            createCaseCard(
                caseRecord,
                recordNumber
            )
        );
    });
}


/* ============================================
   DIRECTORY RENDERING
============================================ */

function renderDirectory() {
    const totalRecords =
        filteredCases.length;

    resultsCount.textContent =
        `${totalRecords.toLocaleString()} ${
            totalRecords === 1
                ? "RECORD"
                : "RECORDS"
        }`;

    loadingStatus.textContent =
        totalRecords === allCases.length
            ? `${allCases.length.toLocaleString()} documented records loaded.`
            : `${totalRecords.toLocaleString()} matching records displayed.`;

    noResultsMessage.hidden =
        totalRecords !== 0;

    caseGrid.hidden =
        totalRecords === 0;

    if (totalRecords === 0) {
        pagination.hidden = true;
        updateMap([]);
        return;
    }

    renderCaseCards();
    updatePagination();
    updateMap(filteredCases);
}


/* ============================================
   PAGINATION
============================================ */

function updatePagination() {
    const totalPages =
        Math.ceil(
            filteredCases.length / RECORDS_PER_PAGE
        );

    pagination.hidden =
        totalPages <= 1;

    paginationStatus.textContent =
        `PAGE ${currentPage} OF ${totalPages}`;

    previousPageButton.disabled =
        currentPage <= 1;

    nextPageButton.disabled =
        currentPage >= totalPages;
}


function changePage(newPage) {
    const totalPages =
        Math.ceil(
            filteredCases.length / RECORDS_PER_PAGE
        );

    if (
        newPage < 1 ||
        newPage > totalPages
    ) {
        return;
    }

    currentPage = newPage;

    renderCaseCards();
    updatePagination();

    document
        .querySelector(".directory-results")
        ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
}


/* ============================================
   CLEAR DIRECTORY
============================================ */

function clearDirectoryFilters() {
    searchInput.value = "";
    caseTypeFilter.value = "";
    statusFilter.value = "";
    yearFilter.value = "";
    identityFilter.value = "";
    sortSelect.value = "name-asc";

    applyFilters();
}


/* ============================================
   MAP
============================================ */

function initializeMap() {
    if (!mapboxgl.accessToken) {
        mapLoading.textContent =
            "MAPBOX ACCESS TOKEN REQUIRED";

        return;
    }

    directoryMap = new mapboxgl.Map({
        container: "directory-map",
        style: "mapbox://styles/mapbox/standard",
        center: [-77.0369, 38.9072],
        zoom: 10.15,
        minZoom: 8,
        maxZoom: 18,
        pitch: 0,
        bearing: 0
    });

    directoryMap.addControl(
        new mapboxgl.NavigationControl({
            showCompass: false
        }),
        "top-right"
    );

    directoryMap.on("style.load", () => {
        directoryMap.setConfigProperty(
            "basemap",
            "lightPreset",
            "night"
        );

        directoryMap.setConfigProperty(
            "basemap",
            "showPointOfInterestLabels",
            false
        );

        directoryMap.setConfigProperty(
            "basemap",
            "showTransitLabels",
            false
        );

        directoryMap.setConfigProperty(
            "basemap",
            "showRoadLabels",
            false
        );

        directoryMap.setConfigProperty(
            "basemap",
            "showPlaceLabels",
            true
        );
    });

    directoryMap.on("load", () => {
        directoryMap.addSource(
            "directory-cases",
            {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features: []
                },
                cluster: true,
                clusterMaxZoom: 13,
                clusterRadius: 42
            }
        );

        directoryMap.addLayer({
            id: "directory-case-clusters",
            type: "circle",
            source: "directory-cases",
            filter: [
                "has",
                "point_count"
            ],
            paint: {
                "circle-color": "#742438",
                "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    17,
                    20,
                    22,
                    50,
                    27
                ],
                "circle-stroke-color": "#f4f0eb",
                "circle-stroke-width": 1.2
            }
        });

        directoryMap.addLayer({
            id: "directory-cluster-count",
            type: "symbol",
            source: "directory-cases",
            filter: [
                "has",
                "point_count"
            ],
            layout: {
                "text-field": [
                    "get",
                    "point_count_abbreviated"
                ],
                "text-size": 11
            },
            paint: {
                "text-color": "#ffffff"
            }
        });

        directoryMap.addLayer({
            id: "directory-case-points",
            type: "circle",
            source: "directory-cases",
            filter: [
                "!",
                ["has", "point_count"]
            ],
            paint: {
                "circle-color": "#742438",
                "circle-radius": 6,
                "circle-stroke-color": "#f4f0eb",
                "circle-stroke-width": 1.4
            }
        });

        addMapInteractions();

        mapLoading.hidden = true;

        updateMap(filteredCases);
    });
}


function convertCasesToGeoJSON(caseRecords) {
    const features = caseRecords
        .filter(isMappableCase)
        .map((caseRecord) => {
            return {
                type: "Feature",

                geometry: {
                    type: "Point",
                    coordinates: [
                        parseCoordinate(
                            caseRecord.longitude
                        ),
                        parseCoordinate(
                            caseRecord.latitude
                        )
                    ]
                },

                properties: {
                    case_id:
                        cleanValue(caseRecord.case_id),

                    display_name:
                        getCaseName(caseRecord),

                    case_type:
                        getCaseType(caseRecord),

                    case_status:
                        getCaseStatus(caseRecord),

                    year:
                        getCaseYear(caseRecord),

                    location:
                        getCaseLocation(caseRecord),

                    record_url:
                        getRecordURL(caseRecord)
                }
            };
        });

    return {
        type: "FeatureCollection",
        features
    };
}


function updateMap(caseRecords) {
    if (
        !directoryMap ||
        !directoryMap.loaded()
    ) {
        return;
    }

    const geoJSON =
        convertCasesToGeoJSON(caseRecords);

    const source =
        directoryMap.getSource("directory-cases");

    if (!source) {
        return;
    }

    source.setData(geoJSON);

    const mappedCount =
        geoJSON.features.length;

    mapStatus.textContent =
        `${mappedCount.toLocaleString()} mapped ${
            mappedCount === 1
                ? "record"
                : "records"
        } shown for the active directory view.`;

    if (mappedCount === 0) {
        directoryMap.easeTo({
            center: [-77.0369, 38.9072],
            zoom: 10.15,
            duration: 500
        });

        return;
    }

    const bounds =
        new mapboxgl.LngLatBounds();

    geoJSON.features.forEach((feature) => {
        bounds.extend(
            feature.geometry.coordinates
        );
    });

    directoryMap.fitBounds(bounds, {
        padding: 55,
        maxZoom: 13,
        duration: 700
    });
}


function addMapInteractions() {
    directoryMap.on(
        "click",
        "directory-case-clusters",
        (event) => {
            const features =
                directoryMap.queryRenderedFeatures(
                    event.point,
                    {
                        layers: [
                            "directory-case-clusters"
                        ]
                    }
                );

            const clusterID =
                features[0]?.properties?.cluster_id;

            const source =
                directoryMap.getSource(
                    "directory-cases"
                );

            if (
                clusterID === undefined ||
                !source
            ) {
                return;
            }

            source.getClusterExpansionZoom(
                clusterID,
                (error, zoom) => {
                    if (error) {
                        return;
                    }

                    directoryMap.easeTo({
                        center:
                            features[0].geometry.coordinates,
                        zoom
                    });
                }
            );
        }
    );

    directoryMap.on(
        "click",
        "directory-case-points",
        (event) => {
            const feature =
                event.features?.[0];

            if (!feature) {
                return;
            }

            showCasePopup(feature);
            highlightCaseCard(
                feature.properties.case_id
            );
        }
    );

    [
        "directory-case-clusters",
        "directory-case-points"
    ].forEach((layerID) => {
        directoryMap.on(
            "mouseenter",
            layerID,
            () => {
                directoryMap.getCanvas()
                    .style.cursor = "pointer";
            }
        );

        directoryMap.on(
            "mouseleave",
            layerID,
            () => {
                directoryMap.getCanvas()
                    .style.cursor = "";
            }
        );
    });
}


function showCasePopup(feature) {
    if (activePopup) {
        activePopup.remove();
    }

    const properties =
        feature.properties;

    const popupHTML = `
        <article class="directory-map-popup">

            <p class="map-popup-case-id">
                ${escapeHTML(properties.case_id)}
            </p>

            <h3>
                ${escapeHTML(properties.display_name)}
            </h3>

            <p class="map-popup-status">
                ${escapeHTML(properties.case_type)}
                /
                ${escapeHTML(properties.case_status)}
            </p>

            <dl>

                <div>
                    <dt>YEAR</dt>
                    <dd>
                        ${escapeHTML(
                            displayFallback(
                                properties.year,
                                "Unknown"
                            )
                        )}
                    </dd>
                </div>

                <div>
                    <dt>LOCATION</dt>
                    <dd>
                        ${escapeHTML(
                            displayFallback(
                                properties.location
                            )
                        )}
                    </dd>
                </div>

            </dl>

            <a href="${properties.record_url}">
                VIEW CASE RECORD →
            </a>

        </article>
    `;

    activePopup =
        new mapboxgl.Popup({
            closeButton: true,
            closeOnClick: true,
            offset: 10,
            maxWidth: "300px"
        })
            .setLngLat(
                feature.geometry.coordinates
            )
            .setHTML(popupHTML)
            .addTo(directoryMap);
}


function highlightMapCase(caseRecord) {
    if (
        !directoryMap ||
        !directoryMap.loaded() ||
        !isMappableCase(caseRecord)
    ) {
        return;
    }

    /*
     * This gently centers the map without forcing a
     * popup open every time someone passes over a card.
     */
    directoryMap.easeTo({
        center: [
            parseCoordinate(caseRecord.longitude),
            parseCoordinate(caseRecord.latitude)
        ],
        zoom: Math.max(
            directoryMap.getZoom(),
            11.5
        ),
        duration: 450
    });
}


function highlightCaseCard(caseID) {
    if (!caseID) {
        return;
    }

    const cards =
        document.querySelectorAll(".case-card");

    cards.forEach((card) => {
        card.classList.remove(
            "case-card-highlighted"
        );
    });

    const matchingCard = [
        ...cards
    ].find((card) => {
        return card.dataset.caseId === caseID;
    });

    if (!matchingCard) {
        return;
    }

    matchingCard.classList.add(
        "case-card-highlighted"
    );

    matchingCard.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}


/* ============================================
   ERROR DISPLAY
============================================ */

function showDataError(message) {
    loadingMessage.hidden = true;
    noResultsMessage.hidden = true;
    caseGrid.hidden = true;
    pagination.hidden = true;

    errorMessage.hidden = false;
    errorText.textContent = message;

    loadingStatus.textContent =
        "Case records could not be loaded.";

    if (mapLoading) {
        mapLoading.textContent =
            "CASE DATA UNAVAILABLE";
    }
}


/* ============================================
   EVENT LISTENERS
============================================ */

searchButton.addEventListener(
    "click",
    applyFilters
);

searchInput.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            applyFilters();
        }
    }
);

clearSearchButton.addEventListener(
    "click",
    clearDirectoryFilters
);

noResultsClearButton.addEventListener(
    "click",
    clearDirectoryFilters
);

caseTypeFilter.addEventListener(
    "change",
    applyFilters
);

statusFilter.addEventListener(
    "change",
    applyFilters
);

yearFilter.addEventListener(
    "change",
    applyFilters
);

identityFilter.addEventListener(
    "change",
    applyFilters
);

sortSelect.addEventListener(
    "change",
    () => {
        sortCases();
        currentPage = 1;
        renderDirectory();
    }
);

previousPageButton.addEventListener(
    "click",
    () => {
        changePage(currentPage - 1);
    }
);

nextPageButton.addEventListener(
    "click",
    () => {
        changePage(currentPage + 1);
    }
);


/* ============================================
   START APPLICATION
============================================ */

loadCaseDirectory();
