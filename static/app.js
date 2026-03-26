const apiBaseURL = '/api/quote';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCfNYZBSgHWbrGp4LwAv93oWVaXmsHnGI4",
    authDomain: "dividendtracker-8e4f0.firebaseapp.com",
    projectId: "dividendtracker-8e4f0",
    databaseURL: "https://dividendtracker-8e4f0-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "dividendtracker-8e4f0.firebasestorage.app",
    messagingSenderId: "54763007764",
    appId: "1:54763007764:web:6232f8fd486db65a095c01",
    measurementId: "G-3859NYMR6F"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const DB_PATH = 'portfolio_dashboard_v1';

// State
let portfolioData = {}; // ticker -> { price, divYield, lastDividendNet, shares, frequency }
let recentSearches = []; 

// Elements
const portfolioBody = document.getElementById('portfolio-body');
const loadingIndicator = document.getElementById('loadingIndicator');
const tickerInput = document.getElementById('ticker-input');
const searchBtn = document.getElementById('search-btn');

const searchResultCard = document.getElementById('search-result-card');
const searchTickerName = document.getElementById('search-ticker-name');
const searchEquity = document.getElementById('search-equity');
const searchChange = document.getElementById('search-change');
const searchYield = document.getElementById('search-yield');
const closeSearchBtn = document.getElementById('close-search-btn');
const addToPortfolioBtn = document.getElementById('add-to-portfolio-btn');
const recentSearchList = document.getElementById('recent-search-list');

// Current searched ticker data (temp holder)
let currentSearchData = null;

const TAX_RATE = 0.85; // 15% dividend tax

// Init
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    console.log("Initializing Dashboard...");
    loadingIndicator.classList.remove('hidden');
    
    try {
        const snapshot = await db.ref(DB_PATH).once('value');
        if (snapshot.exists()) {
            const savedData = snapshot.val();
            console.log("Firebase data found:", savedData);
            
            const tickers = Object.keys(savedData);
            if (tickers.length === 0) {
                console.log("No tickers in Firebase, loading defaults...");
                await loadPortfolio(['DIVO', 'QQQI', 'SPMO', 'SPYI']);
            } else {
                const promises = tickers.map(t => fetchQuote(t));
                const results = await Promise.all(promises);

                results.forEach(data => {
                    if (data) {
                        const shares = savedData[data.ticker] || 0;
                        addTickerToPortfolio(data, shares, false);
                    }
                });
            }
        } else {
            console.log("No data at Firebase path, loading defaults...");
            await loadPortfolio(['DIVO', 'QQQI', 'SPMO', 'SPYI']);
        }
    } catch (error) {
        console.error("Firebase init/load error:", error);
        await loadPortfolio(['DIVO', 'QQQI', 'SPMO', 'SPYI']);
    } finally {
        loadingIndicator.classList.add('hidden');
    }
}

function saveToFirebase() {
    const dataToSave = {};
    Object.keys(portfolioData).forEach(ticker => {
        dataToSave[ticker] = portfolioData[ticker].shares;
    });
    db.ref(DB_PATH).set(dataToSave);
}

function setupEventListeners() {
    searchBtn.addEventListener('click', handleSearch);
    tickerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    closeSearchBtn.addEventListener('click', () => {
        searchResultCard.classList.add('hidden');
    });

    addToPortfolioBtn.addEventListener('click', () => {
        if (currentSearchData && !portfolioData[currentSearchData.ticker]) {
            addTickerToPortfolio(currentSearchData);
            searchResultCard.classList.add('hidden');
        } else {
            alert('Stock is already in your portfolio.');
        }
    });

    // Delegate input change for dynamically created share inputs
    portfolioBody.addEventListener('input', (e) => {
        if (e.target.classList.contains('shares-input')) {
            const ticker = e.target.dataset.ticker;
            let shares = parseInt(e.target.value);
            if (isNaN(shares) || shares < 0) shares = 0;
            
            portfolioData[ticker].shares = shares;
            updateRowCalculations(ticker);
            saveToFirebase();
        }
    });
}

async function fetchQuote(ticker) {
    try {
        const response = await fetch(`${apiBaseURL}?ticker=${ticker}`);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to fetch data');
        }
        return await response.json();
    } catch (error) {
        console.error("Error fetching quote for", ticker, error);
        return null; // Return null on error
    }
}

async function loadPortfolio(tickers) {
    loadingIndicator.classList.remove('hidden');
    portfolioBody.innerHTML = '';
    
    // Fetch quotes concurrently
    const promises = tickers.map(t => fetchQuote(t));
    const results = await Promise.all(promises);

    results.forEach(data => {
        if (data) addTickerToPortfolio(data, 100); // Default 100 shares for demo
    });

    loadingIndicator.classList.add('hidden');
}

function addTickerToPortfolio(data, defaultShares = 0, shouldSave = true) {
    const ticker = data.ticker;
    portfolioData[ticker] = {
        ...data,
        shares: defaultShares
    };

    renderRow(ticker);
    if (shouldSave) saveToFirebase();
}

function renderRow(ticker) {
    const data = portfolioData[ticker];
    
    // Update existing row or create new
    let tr = document.getElementById(`row-${ticker}`);
    if (!tr) {
        tr = document.createElement('tr');
        tr.id = `row-${ticker}`;
        portfolioBody.appendChild(tr);
    }
    
    const equity = data.currentPrice * data.shares;
    const unitDivNet = data.lastDividendNet || (data.lastDividend * TAX_RATE);
    const totalDivNet = unitDivNet * data.shares;

    tr.innerHTML = `
        <td>
            <div class="ticker-cell">
                <span class="ticker-logo">${data.frequency || '1'}</span>
                <strong>${ticker}</strong>
            </div>
        </td>
        <td>
            <input type="number" class="shares-input" data-ticker="${ticker}" value="${data.shares}" min="0">
        </td>
        <td>$${data.currentPrice.toFixed(2)}</td>
        <td id="equity-${ticker}">$${equity.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td>${data.dividendYield.toFixed(2)}%</td>
        <td>$${unitDivNet.toFixed(4)}</td>
        <td id="total-div-${ticker}">$${totalDivNet.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
    `;
}

function updateRowCalculations(ticker) {
    const data = portfolioData[ticker];
    const equityElement = document.getElementById(`equity-${ticker}`);
    const totalDivElement = document.getElementById(`total-div-${ticker}`);
    
    if (!equityElement || !totalDivElement) return;

    const equity = data.currentPrice * data.shares;
    const unitDivNet = data.lastDividendNet || (data.lastDividend * TAX_RATE);
    const totalDivNet = unitDivNet * data.shares;

    equityElement.innerText = `$${equity.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
    totalDivElement.innerText = `$${totalDivNet.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Add brief animation to highlight change
    equityElement.style.color = 'var(--accent-color)';
    totalDivElement.style.color = 'var(--accent-color)';
    setTimeout(() => {
        equityElement.style.color = '';
        totalDivElement.style.color = '';
    }, 300);
}

async function handleSearch() {
    const ticker = tickerInput.value.trim().toUpperCase();
    if (!ticker) return;

    const prevIconHtml = searchBtn.innerHTML;
    searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    searchBtn.disabled = true;

    const data = await fetchQuote(ticker);
    
    searchBtn.innerHTML = prevIconHtml;
    searchBtn.disabled = false;

    if (data) {
        currentSearchData = data;
        
        // Show Card
        searchTickerName.innerText = data.ticker;
        searchEquity.innerText = `$${data.currentPrice.toFixed(2)}`;
        
        const changeClass = data.change >= 0 ? 'positive' : 'negative';
        const changeSign = data.change >= 0 ? '+' : '';
        searchChange.innerText = `${changeSign}${data.change.toFixed(2)}`;
        searchChange.className = `value ${changeClass}`;
        
        searchYield.innerText = `${data.dividendYield.toFixed(2)}% (Freq: ${data.frequency || '0'})`;
        
        searchResultCard.classList.remove('hidden');
        
        // Add to recent
        addToRecent(data);
    } else {
        alert("Ticker not found or error fetching data.");
        searchResultCard.classList.add('hidden');
    }
}

function addToRecent(data) {
    // Remove if exists to push to top
    recentSearches = recentSearches.filter(t => t.ticker !== data.ticker);
    recentSearches.unshift(data);
    
    // Keep max 5
    if (recentSearches.length > 5) recentSearches.pop();
    
    renderRecentSearches();
}

function renderRecentSearches() {
    recentSearchList.innerHTML = '';
    recentSearches.forEach(data => {
        const li = document.createElement('li');
        li.className = 'recent-item';
        
        const changeClass = data.change >= 0 ? 'positive' : 'negative';
        const changeSign = data.change >= 0 ? '+' : '';

        li.innerHTML = `
            <div class="recent-ticker">${data.ticker}</div>
            <div class="recent-details">
                <div class="recent-price">$${data.currentPrice.toFixed(2)} <span class="${changeClass}" style="font-size: 0.8rem;">${changeSign}${data.change.toFixed(2)}</span></div>
                <div class="recent-yield">Yield: ${data.dividendYield.toFixed(2)}%</div>
            </div>
        `;
        recentSearchList.appendChild(li);
    });
}
