"use strict";

mapboxgl.accessToken =
    "pk.eyJ1IjoiYXZlcnllam9obnMiLCJhIjoiY21uNmo3YnNiMDZrYTJwcTFwcHRzOG83NCJ9.aFx3CE9PzNOHSiDO7cEf2g";

const CASE_DATA_PATH =
    "data/01_master_case_files/01_cases_master_cleaned_FIXED.csv";

const HIGHWAY_DATA_PATH =
    "data/02_geographic_boundary_files/02_interstate_highways.geojson";


function initializeMap() {
    if (!mapboxgl.accessToken) {
        mapLoading.textContent =
            "ADD MAPBOX PUBLIC ACCESS TOKEN";

        searchStatus.textContent =
            "The map requires a Mapbox public access token.";

        return;
    }

    map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-77.0369, 38.9072],
        zoom: 10.15,
        minZoom: 8,
        maxZoom: 18,
        pitch: 0,
        bearing: 0
    });

    map.addControl(
        new mapboxgl.NavigationControl({
            showCompass: false
        }),
        "top-right"
    );

    map.on("load", () => {
        // addHighwayLayer();
        loadCaseData();
    });

    map.on("error", (event) => {
        console.error("Mapbox error:", event.error);
    });
}

/* =========================================
   PAGE ELEMENTS
========================================= */

const searchInput = document.getElementById("case-search");
const searchButton = document.getElementById("search-button");
const caseTypeFilter = document.getElementById("case-type-filter");
const yearFilter = document.getElementById("year-filter");
const searchStatus = document.getElementById("search-status");
const mapLoading = document.getElementById("map-loading");


/* =========================================
   APPLICATION STATE
========================================= */

let map;
let allCases = [];
let caseGeoJSON = {
    type: "FeatureCollection",
    features: []
};


/* =========================================
   HELPERS
========================================= */

function cleanValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}


function escapeHTML(value) {
    return cleanValue(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function normalizeValue(value) {
    return cleanValue(value).toLowerCase();
}


function createCaseGeoJSON(rows) {
    const features = rows
        .map((row) => {
            const longitude = Number.parseFloat(row.longitude);
            const latitude = Number.parseFloat(row.latitude);

            if (
                !Number.isFinite(longitude) ||
                !Number.isFinite(latitude)
            ) {
                return null;
            }

            return {
                type: "Feature",

                geometry: {
                    type: "Point",
                    coordinates: [longitude, latitude]
                },

                properties: {
                    case_id: cleanValue(row.case_id),
                    display_name: cleanValue(row.display_name),
                    case_type: cleanValue(row.case_type),
                    case_status: cleanValue(row.case_status),
                    outcome: cleanValue(row.outcome),
                    year_last_seen: cleanValue(row.year_last_seen),
                    age_at_event: cleanValue(row.age_at_event),
                    geocoded_address: cleanValue(row.geocoded_address),
                    case_summary: cleanValue(row.case_summary),
                    source_link: cleanValue(row.source_link)
                }
            };
        })
        .filter(Boolean);

    return {
        type: "FeatureCollection",
        features
    };
}


function populateFilters(rows) {
    const caseTypes = [
        ...new Set(
            rows
                .map((row) => cleanValue(row.case_type))
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));

    const years = [
        ...new Set(
            rows
                .map((row) => cleanValue(row.year_last_seen))
                .filter(Boolean)
        )
    ].sort((a, b) => Number(b) - Number(a));


    caseTypes.forEach((caseType) => {
        const option = document.createElement("option");

        option.value = caseType;
        option.textContent = caseType;

        caseTypeFilter.appendChild(option);
    });


    years.forEach((year) => {
        const option = document.createElement("option");

        option.value = year;
        option.textContent = year;

        yearFilter.appendChild(option);
    });
}


function getFilteredCases() {
    const searchTerm = normalizeValue(searchInput.value);
    const selectedType = normalizeValue(caseTypeFilter.value);
    const selectedYear = cleanValue(yearFilter.value);

    return allCases.filter((row) => {
        const searchableText = [
            row.case_id,
            row.display_name,
            row.case_type,
            row.case_status,
            row.outcome,
            row.year_last_seen,
            row.geocoded_address,
            row.case_summary
        ]
            .map(normalizeValue)
            .join(" ");

        const matchesSearch =
            !searchTerm || searchableText.includes(searchTerm);

        const matchesType =
            !selectedType ||
            normalizeValue(row.case_type) === selectedType;

        const matchesYear =
            !selectedYear ||
            cleanValue(row.year_last_seen) === selectedYear;

        return matchesSearch && matchesType && matchesYear;
    });
}


function updateMapCases(rows) {
    caseGeoJSON = createCaseGeoJSON(rows);

    const source = map.getSource("case-points");

    if (source) {
        source.setData(caseGeoJSON);
    }

    const count = caseGeoJSON.features.length;

    searchStatus.textContent =
        `${count} documented ${count === 1 ? "case" : "cases"} shown.`;
}


function applyFilters() {
    const filteredCases = getFilteredCases();

    updateMapCases(filteredCases);
}


/* =========================================
   LOAD CASE CSV
========================================= */

function loadCaseData() {
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

            allCases = results.data.filter((row) => {
                return (
                    cleanValue(row.latitude) &&
                    cleanValue(row.longitude)
                );
            });

            caseGeoJSON = createCaseGeoJSON(allCases);

            populateFilters(allCases);
            addCaseLayer();

            searchStatus.textContent =
                `${caseGeoJSON.features.length} documented cases shown.`;

            mapLoading.hidden = true;
        },

        error(error) {
            console.error("Unable to load case CSV:", error);

            searchStatus.textContent =
                "The case data could not be loaded.";

            mapLoading.textContent =
                "CASE DATA COULD NOT BE LOADED";
        }
    });
}

/* =========================================
   MAP LAYERS
========================================= */

function addHighwayLayer() {
    map.addSource("interstate-highways", {
        type: "geojson",
        data: HIGHWAY_DATA_PATH
    });

    map.addLayer({
        id: "interstate-highways-shadow",
        type: "line",
        source: "interstate-highways",

        paint: {
            "line-color": "#ffffff",
            "line-width": 5,
            "line-opacity": 0.8
        }
    });

    map.addLayer({
        id: "interstate-highways-line",
        type: "line",
        source: "interstate-highways",

        paint: {
            "line-color": "#467d42",
            "line-width": 2.4,
            "line-opacity": 0.9
        }
    });
}

function createPopupHTML(properties) {
    const value = (field) => {
        if (
            field === null ||
            field === undefined ||
            String(field).trim() === ""
        ) {
            return "Unknown";
        }

        return String(field);
    };

    const name = value(properties.display_name);
    const caseType = value(properties.case_type);
    const age = value(properties.age_at_event);
    const location = value(properties.geocoded_address);
    const year = value(properties.year_last_seen);
    const status = value(properties.case_status);
    const summary = value(properties.case_summary);
    const sourceLink = value(properties.source_link);

    return `
        <div class="case-popup">
            <h2>${name}</h2>

            <div class="popup-divider"></div>

            <div class="popup-detail">
    <span class="popup-label">CASE TYPE</span>
    <span class="popup-value">${caseType}</span>
</div>

<div class="popup-detail">
    <span class="popup-label">AGE</span>
    <span class="popup-value">${age}</span>
</div>

<div class="popup-detail">
    <span class="popup-label">LOCATION</span>
    <span class="popup-value">${location}</span>
</div>

<div class="popup-detail">
    <span class="popup-label">YEAR</span>
    <span class="popup-value">${year}</span>
</div>

<div class="popup-detail">
    <span class="popup-label">STATUS</span>
    <span class="popup-value">${status}</span>
</div>

            ${
                summary !== "Unknown"
                    ? `
                        <p class="popup-summary">
                            “${summary}”
                        </p>
                    `
                    : ""
            }

            ${
                sourceLink !== "Unknown"
                    ? `
                        <a
                            class="popup-link"
                            href="${sourceLink}"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            ↗ View Source
                        </a>
                    `
                    : ""
            }
        </div>
    `;
}

function addCaseLayer() {
    map.addSource("case-points", {
        type: "geojson",
        data: caseGeoJSON,
        cluster: false
    });

    map.addLayer({
        id: "case-heatmap",
        type: "heatmap",
        source: "case-points",
        maxzoom: 16,

        paint: {
            "heatmap-weight": 1,

            "heatmap-intensity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8, 0.9,
                12, 1.4,
                16, 2
            ],

            "heatmap-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8, 14,
                12, 22,
                16, 34
            ],

            "heatmap-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8, 0.8,
                13, 0.6,
                16, 0.3
            ],

            "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],

                0,
                "rgba(0, 0, 0, 0)",

                0.2,
                "rgba(72, 0, 20, 0.20)",

                0.4,
                "rgba(105, 0, 30, 0.38)",

                0.6,
                "rgba(128, 0, 38, 0.58)",

                0.8,
                "rgba(154, 18, 52, 0.76)",

                1,
                "rgba(190, 45, 72, 0.92)"
            ]
        }
    });

    map.addLayer({
        id: "case-location-points",
        type: "circle",
        source: "case-points",

     paint: {
    "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        8, 2.5,
        12, 3.5,
        16, 5
    ],

    "circle-color": "#7a1538",
    "circle-opacity": 0.92,
    "circle-stroke-color": "#2b0613",
    "circle-stroke-width": 1.4,
    "circle-blur": 0.15
        
    map.on("click", "case-location-points", (event) => {
        if (!event.features || !event.features.length) {
            return;
        }

        const feature = event.features[0];
        const coordinates =
            feature.geometry.coordinates.slice();

        new mapboxgl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: "360px"
        })
            .setLngLat(coordinates)
            .setHTML(createPopupHTML(feature.properties))
            .addTo(map);
    });

    map.on("mouseenter", "case-location-points", () => {
        map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "case-location-points", () => {
        map.getCanvas().style.cursor = "";
    });
}

/* =========================================
   SEARCH EVENTS
========================================= */
searchButton.addEventListener("click", applyFilters);

searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        applyFilters();
    }
});

searchInput.addEventListener("input", applyFilters);
caseTypeFilter.addEventListener("change", applyFilters);
yearFilter.addEventListener("change", applyFilters);

initializeMap();
