const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Variables pour stocker les données
let predictionHistory = [];
let pendingVerification = [];

// Constantes de configuration
const MIN_ODDS = 1.50;
const MIN_PROBABILITY = 70.00;
const SAFE_PREDICTION_MIN = 90.00;
const MAX_VERIFICATION_ROUNDS = 3; // Changé de 5 à 3
const REQUIRED_COEFFICIENTS = 5;

// Fonctions de calcul de prédiction (logique protégée)
function calculateTrend(oddsArray) {
    const firstHalf = oddsArray.slice(0, Math.floor(oddsArray.length / 2));
    const secondHalf = oddsArray.slice(Math.floor(oddsArray.length / 2));
    const firstAvg = firstHalf.reduce((acc, curr) => acc + curr, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((acc, curr) => acc + curr, 0) / secondHalf.length;
    return 1 + ((secondAvg - firstAvg) / firstAvg);
}

function predictOdds(coefficients, settings) {
    let oddsArray = [...coefficients]
        .filter(odd => !isNaN(odd) && odd > 1);

    if (oddsArray.length < REQUIRED_COEFFICIENTS) {
        throw new Error(`Au moins ${REQUIRED_COEFFICIENTS} coefficients sont requis`);
    }

    if (settings.excludeExtremes) {
        oddsArray.sort((a, b) => a - b);
        oddsArray = oddsArray.slice(1, -1);
    }

    let averageOdds;
    switch(settings.analysisMode) {
        case 'advanced':
            const weights = oddsArray.map((_, i) => 1 + (i * 0.1));
            const weightedSum = oddsArray.reduce((acc, curr, i) => acc + (curr * weights[i]), 0);
            const weightSum = weights.reduce((acc, curr) => acc + curr, 0);
            averageOdds = weightedSum / weightSum;
            break;
        case 'pro':
            const trend = settings.trendAnalysis ? calculateTrend(oddsArray) : 1;
            averageOdds = (oddsArray.reduce((acc, curr) => acc + curr, 0) / oddsArray.length) * trend;
            break;
        default:
            averageOdds = oddsArray.reduce((acc, curr) => acc + curr, 0) / oddsArray.length;
    }

    const probabilities = oddsArray.map(odd => (1 / odd * 100).toFixed(2));
    const mainProbability = parseFloat(probabilities[0]);
    
    // Récupérer les valeurs de filtrage
    const minOdds = settings.minOdds || MIN_ODDS;
    const minProbability = settings.minProbability || MIN_PROBABILITY;
    
    // Vérifier si la prédiction respecte les filtres
    const meetsFilters = averageOdds >= minOdds && mainProbability >= minProbability;
    
    if (!meetsFilters) {
        throw new Error(`Prédiction filtrée (côte: ${averageOdds.toFixed(2)} < ${minOdds} ou probabilité: ${mainProbability}% < ${minProbability}%)`);
    }

    // Vérifier si c'est une prédiction sûre
    const isSafePrediction = mainProbability >= SAFE_PREDICTION_MIN;

    return {
        averageOdds: averageOdds.toFixed(2),
        probabilities: probabilities,
        originalOdds: oddsArray,
        meetsFilters: meetsFilters,
        isSafePrediction: isSafePrediction,
        mainProbability: mainProbability
    };
}

// Route racine
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Backend - Robot de Prédiction Pro V2.5</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #f0f9ff, #e6f7ff);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .container {
                    text-align: center;
                    background: white;
                    padding: 40px;
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    max-width: 600px;
                }
                h1 {
                    color: #1e3a8a;
                    margin-bottom: 10px;
                }
                .status {
                    color: #10b981;
                    font-weight: bold;
                    margin: 20px 0;
                    font-size: 1.2rem;
                }
                .version {
                    background: #3b82f6;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.9rem;
                    display: inline-block;
                    margin-bottom: 20px;
                }
                .filters {
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    text-align: left;
                }
                .endpoints {
                    text-align: left;
                    background: #f9fafb;
                    padding: 20px;
                    border-radius: 8px;
                    margin-top: 20px;
                }
                .endpoint-item {
                    margin: 10px 0;
                    padding: 8px;
                    background: white;
                    border-radius: 6px;
                    border-left: 4px solid #3b82f6;
                }
                code {
                    background: #e5e7eb;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: monospace;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Backend - Robot de Prédiction Pro</h1>
                <div class="version">Version 2.5 - Filtrage Intelligent</div>
                <div class="status">✅ Serveur opérationnel</div>
                
                <div class="filters">
                    <h3>🎯 Filtres Actifs :</h3>
                    <ul>
                        <li><strong>Côte minimum :</strong> ${MIN_ODDS}</li>
                        <li><strong>Probabilité minimum :</strong> ${MIN_PROBABILITY}%</li>
                        <li><strong>Prédictions sûres :</strong> ≥ ${SAFE_PREDICTION_MIN}%</li>
                        <li><strong>Vérification :</strong> ${MAX_VERIFICATION_ROUNDS} rounds</li>
                    </ul>
                </div>
                
                <div class="endpoints">
                    <h3>📡 Endpoints disponibles :</h3>
                    <div class="endpoint-item">
                        <code>GET /api/coefficients</code> - Récupère les coefficients
                    </div>
                    <div class="endpoint-item">
                        <code>POST /api/predict</code> - Génère une prédiction (avec filtrage)
                    </div>
                    <div class="endpoint-item">
                        <code>POST /api/verify</code> - Vérifie une prédiction (${MAX_VERIFICATION_ROUNDS} rounds)
                    </div>
                    <div class="endpoint-item">
                        <code>GET /api/history</code> - Récupère l'historique
                    </div>
                    <div class="endpoint-item">
                        <code>GET /api/stats</code> - Récupère les statistiques
                    </div>
                    <div class="endpoint-item">
                        <code>GET /api/analyze</code> - Analyse les données historiques
                    </div>
                </div>
                
                <p style="margin-top: 20px; color: #6b7280; font-size: 0.9rem;">
                    Frontend connecté : 
                    <a href="https://crash-v2-4.onrender.com" target="_blank" style="color: #3b82f6;">
                        https://crash-v2-4.onrender.com
                    </a>
                </p>
            </div>
        </body>
        </html>
    `);
});

// API pour récupérer les coefficients
app.get('/api/coefficients', async (req, res) => {
    try {
        const apiURL = "https://crash-gateway-grm-cr.100hp.app/state";
        const headers = {
            'customer-id': '077dee8d-c923-4c02-9bee-757573662e69',
            'session-id': '95a987ef-72e1-4eaa-a598-64a157a44e75',
            'accept': 'application/json',
        };
        
        const response = await fetch(apiURL, { headers });
        if (!response.ok) throw new Error("Erreur API");

        const data = await response.json();
        const coefficient = data.stopCoefficients?.[0] ?? null;
        
        let adjustedCoefficient = null;
        if (coefficient !== null) {
            adjustedCoefficient = coefficient === 1.00 ? 1.01 : coefficient;
            adjustedCoefficient = parseFloat(adjustedCoefficient.toFixed(2));
        }
        
        res.json({
            success: true,
            coefficient: adjustedCoefficient,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API pour générer une prédiction
app.post('/api/predict', (req, res) => {
    try {
        const { coefficients, settings } = req.body;
        
        if (!coefficients || !Array.isArray(coefficients)) {
            return res.status(400).json({
                success: false,
                error: 'Les coefficients sont requis'
            });
        }

        const prediction = predictOdds(coefficients, settings || {
            analysisMode: 'pro',
            excludeExtremes: true,
            trendAnalysis: false,
            minOdds: MIN_ODDS,
            minProbability: MIN_PROBABILITY
        });

        const predictionResult = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            averageOdds: prediction.averageOdds,
            probabilities: prediction.probabilities,
            originalOdds: coefficients.join(', '),
            analysisMode: settings?.analysisMode || 'pro',
            status: 'pending',
            verificationStatus: 'pending',
            meetsFilters: prediction.meetsFilters,
            isSafePrediction: prediction.isSafePrediction,
            mainProbability: prediction.mainProbability,
            verifiedRound: null,
            round: null
        };

        // Ajouter à l'historique
        predictionHistory.unshift(predictionResult);
        
        // Limiter l'historique aux 100 dernières entrées
        if (predictionHistory.length > 100) {
            predictionHistory = predictionHistory.slice(0, 100);
        }

        res.json({
            success: true,
            prediction: predictionResult,
            historySize: predictionHistory.length,
            message: prediction.isSafePrediction ? 
                'Prédiction de haute qualité générée (≥90%)' : 
                'Prédiction générée avec succès'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
            code: error.message.includes('filtrée') ? 'FILTERED_PREDICTION' : 'PREDICTION_ERROR'
        });
    }
});

// API pour vérifier une prédiction
app.post('/api/verify', (req, res) => {
    try {
        const { predictionId, currentCoefficient, currentRound } = req.body;
        const maxRounds = MAX_VERIFICATION_ROUNDS;
        
        const predictionIndex = predictionHistory.findIndex(p => p.id === predictionId);
        if (predictionIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Prédiction non trouvée'
            });
        }

        const prediction = predictionHistory[predictionIndex];
        const predictedOdds = parseFloat(prediction.averageOdds);

        let result = {
            verified: false,
            currentRound: currentRound + 1,
            status: 'pending'
        };

        if (currentCoefficient >= predictedOdds) {
            // Succès
            predictionHistory[predictionIndex].status = 'success';
            predictionHistory[predictionIndex].verificationStatus = 'success';
            predictionHistory[predictionIndex].verifiedRound = currentRound;
            predictionHistory[predictionIndex].round = currentRound;
            result = {
                verified: true,
                status: 'success',
                round: currentRound
            };
        } else if (currentRound >= maxRounds) {
            // Échec après maxRounds rounds
            predictionHistory[predictionIndex].status = 'failed';
            predictionHistory[predictionIndex].verificationStatus = 'failed';
            result = {
                verified: false,
                status: 'failed',
                message: `Non validée dans les ${maxRounds} rounds`
            };
        }

        res.json({
            success: true,
            result,
            prediction: predictionHistory[predictionIndex]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API pour obtenir l'historique
app.get('/api/history', (req, res) => {
    res.json({
        success: true,
        history: predictionHistory,
        stats: {
            total: predictionHistory.length,
            success: predictionHistory.filter(p => p.status === 'success').length,
            failed: predictionHistory.filter(p => p.status === 'failed').length,
            pending: predictionHistory.filter(p => p.status === 'pending').length,
            safePredictions: predictionHistory.filter(p => p.isSafePrediction).length
        }
    });
});

// API pour obtenir les statistiques
app.get('/api/stats', (req, res) => {
    const success = predictionHistory.filter(p => p.status === 'success').length;
    const total = predictionHistory.length;
    const accuracy = total > 0 ? ((success / total) * 100).toFixed(1) : '0';

    // Statistiques des prédictions sûres
    const safePredictions = predictionHistory.filter(p => p.isSafePrediction);
    const safeSuccess = safePredictions.filter(p => p.status === 'success').length;
    const safeAccuracy = safePredictions.length > 0 ? 
        ((safeSuccess / safePredictions.length) * 100).toFixed(1) : '0';

    res.json({
        success: true,
        stats: {
            totalPredictions: total,
            predictionAccuracy: accuracy,
            successCount: success,
            failedCount: predictionHistory.filter(p => p.status === 'failed').length,
            pendingCount: predictionHistory.filter(p => p.status === 'pending').length,
            safePredictions: safePredictions.length,
            safePredictionAccuracy: safeAccuracy,
            safeSuccessCount: safeSuccess,
            minOdds: MIN_ODDS,
            minProbability: MIN_PROBABILITY,
            maxVerificationRounds: MAX_VERIFICATION_ROUNDS
        }
    });
});

// Fonctions d'analyse
function analyzePercentageRanges(predictions) {
    const ranges = {};
    const allPredictions = predictionHistory.filter(p => p.status !== 'pending');

    allPredictions.forEach(pred => {
        const probability = parseFloat(pred.probabilities[0]);
        const rangeStart = Math.floor(probability / 10) * 10;
        const rangeKey = `${rangeStart}-${rangeStart + 10}`;
        
        if (!ranges[rangeKey]) {
            ranges[rangeKey] = { total: 0, success: 0 };
        }
        ranges[rangeKey].total++;
        if (pred.status === 'success') {
            ranges[rangeKey].success++;
        }
    });

    let bestRange = '';
    let bestCount = 0;
    let bestSuccessRate = 0;

    Object.entries(ranges).forEach(([range, stats]) => {
        const successRate = (stats.success / stats.total) * 100;
        if (stats.success > bestCount || (stats.success === bestCount && successRate > bestSuccessRate)) {
            bestRange = range;
            bestCount = stats.success;
            bestSuccessRate = successRate;
        }
    });

    return {
        bestRange,
        bestCount,
        successRate: bestSuccessRate.toFixed(1)
    };
}

function analyzeRounds(predictions) {
    const roundStats = {};
    const allPredictions = predictionHistory.filter(p => p.status !== 'pending' && p.round);

    allPredictions.forEach(pred => {
        if (!roundStats[pred.round]) {
            roundStats[pred.round] = { total: 0, success: 0 };
        }
        roundStats[pred.round].total++;
        if (pred.status === 'success') {
            roundStats[pred.round].success++;
        }
    });

    let bestRound = 0;
    let bestSuccessRate = 0;
    let roundCount = 0;
    let totalForRound = 0;

    Object.entries(roundStats).forEach(([round, stats]) => {
        const successRate = (stats.success / stats.total) * 100;
        if (successRate > bestSuccessRate || (successRate === bestSuccessRate && stats.success > roundCount)) {
            bestRound = round;
            bestSuccessRate = successRate;
            roundCount = stats.success;
            totalForRound = stats.total;
        }
    });

    return {
        bestRound,
        roundCount,
        totalForRound,
        successRate: bestSuccessRate.toFixed(1)
    };
}

function analyzeOddsRanges(predictions) {
    const ranges = {};
    predictions.forEach(pred => {
        const odds = parseFloat(pred.averageOdds);
        const rangeStart = Math.floor(odds * 2) / 2;
        const rangeKey = `${rangeStart.toFixed(1)}-${(rangeStart + 0.5).toFixed(1)}`;
        
        ranges[rangeKey] = (ranges[rangeKey] || 0) + 1;
    });

    let bestRange = '';
    let maxSuccess = 0;

    Object.entries(ranges).forEach(([range, count]) => {
        if (count > maxSuccess) {
            bestRange = range;
            maxSuccess = count;
        }
    });

    return {
        bestRange,
        successCount: maxSuccess
    };
}

// API pour analyser les données historiques
app.get('/api/analyze', (req, res) => {
    try {
        const successfulPredictions = predictionHistory.filter(p => p.status === 'success');
        
        if (successfulPredictions.length === 0) {
            return res.json({
                success: true,
                analysis: {
                    hasData: false,
                    message: 'Pas encore assez de données pour l\'analyse'
                }
            });
        }

        // Analyse des plages de probabilité
        const percentageRanges = analyzePercentageRanges(successfulPredictions);
        const roundAnalysis = analyzeRounds(successfulPredictions);
        const oddsAnalysis = analyzeOddsRanges(successfulPredictions);
        
        // Analyse des prédictions sûres (90-100%)
        const safePredictions = predictionHistory.filter(p => p.isSafePrediction && p.status !== 'pending');
        const safeSuccess = safePredictions.filter(p => p.status === 'success').length;
        const safePredictionSuccessRate = safePredictions.length > 0 ? 
            ((safeSuccess / safePredictions.length) * 100).toFixed(1) : '0';
        
        // Analyse des prédictions filtrées
        const filteredPredictions = predictionHistory.filter(p => !p.meetsFilters);
        const totalFiltered = filteredPredictions.length;

        res.json({
            success: true,
            analysis: {
                hasData: true,
                percentageRanges,
                roundAnalysis,
                oddsAnalysis,
                safePredictions: safePredictions.length,
                safeSuccessCount: safeSuccess,
                safePredictionSuccessRate,
                totalSuccessful: successfulPredictions.length,
                totalFiltered: totalFiltered,
                configuration: {
                    minOdds: MIN_ODDS,
                    minProbability: MIN_PROBABILITY,
                    safePredictionThreshold: SAFE_PREDICTION_MIN,
                    maxVerificationRounds: MAX_VERIFICATION_ROUNDS
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API pour obtenir la configuration
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: {
            minOdds: MIN_ODDS,
            minProbability: MIN_PROBABILITY,
            safePredictionMin: SAFE_PREDICTION_MIN,
            maxVerificationRounds: MAX_VERIFICATION_ROUNDS,
            requiredCoefficients: REQUIRED_COEFFICIENTS,
            version: '2.5',
            description: 'Robot de Prédiction Pro - Version Filtrage Intelligent'
        }
    });
});

// Route pour réinitialiser l'historique (développement seulement)
app.post('/api/reset', (req, res) => {
    const { secret } = req.body;
    
    if (secret !== process.env.RESET_SECRET) {
        return res.status(401).json({
            success: false,
            error: 'Non autorisé'
        });
    }
    
    predictionHistory = [];
    pendingVerification = [];
    
    res.json({
        success: true,
        message: 'Historique réinitialisé'
    });
});

// Route de santé
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        historySize: predictionHistory.length,
        pendingVerifications: pendingVerification.length
    });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur backend démarré sur le port ${PORT}`);
    console.log(`📡 API disponible sur: http://localhost:${PORT}/`);
    console.log(`🔗 Frontend: https://crash-v2-4.onrender.com`);
    console.log(`🎯 Configuration:`);
    console.log(`   - Côte minimum: ${MIN_ODDS}`);
    console.log(`   - Probabilité minimum: ${MIN_PROBABILITY}%`);
    console.log(`   - Prédictions sûres: ≥ ${SAFE_PREDICTION_MIN}%`);
    console.log(`   - Vérification: ${MAX_VERIFICATION_ROUNDS} rounds`);
});