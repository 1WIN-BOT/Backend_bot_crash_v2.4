// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Variables pour stocker les données (en production, utiliser une base de données)
let predictionHistory = [];
let pendingVerification = [];

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

    if (oddsArray.length < 5) {
        throw new Error('Au moins 5 coefficients sont requis');
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

    return {
        averageOdds: averageOdds.toFixed(2),
        probabilities: probabilities,
        originalOdds: oddsArray
    };
}

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
            analysisMode: 'standard',
            excludeExtremes: false,
            trendAnalysis: false
        });

        const predictionResult = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            averageOdds: prediction.averageOdds,
            probabilities: prediction.probabilities,
            originalOdds: coefficients.join(', '),
            analysisMode: settings?.analysisMode || 'standard',
            status: 'pending',
            verificationStatus: 'pending'
        };

        // Ajouter à l'historique
        predictionHistory.unshift(predictionResult);
        
        // Limiter l'historique aux 50 dernières entrées
        if (predictionHistory.length > 50) {
            predictionHistory = predictionHistory.slice(0, 50);
        }

        res.json({
            success: true,
            prediction: predictionResult,
            historySize: predictionHistory.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API pour vérifier une prédiction
app.post('/api/verify', (req, res) => {
    try {
        const { predictionId, currentCoefficient, currentRound } = req.body;
        
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
            result = {
                verified: true,
                status: 'success',
                round: currentRound
            };
        } else if (currentRound >= 5) {
            // Échec après 5 rounds
            predictionHistory[predictionIndex].status = 'failed';
            predictionHistory[predictionIndex].verificationStatus = 'failed';
            result = {
                verified: false,
                status: 'failed',
                message: 'Non validée dans les 5 rounds'
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
            pending: predictionHistory.filter(p => p.status === 'pending').length
        }
    });
});

// API pour obtenir les statistiques
app.get('/api/stats', (req, res) => {
    const success = predictionHistory.filter(p => p.status === 'success').length;
    const total = predictionHistory.length;
    const accuracy = total > 0 ? ((success / total) * 100).toFixed(1) : '0';

    res.json({
        success: true,
        stats: {
            totalPredictions: total,
            predictionAccuracy: accuracy,
            successCount: success,
            failedCount: predictionHistory.filter(p => p.status === 'failed').length,
            pendingCount: predictionHistory.filter(p => p.status === 'pending').length
        }
    });
});

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

        res.json({
            success: true,
            analysis: {
                hasData: true,
                percentageRanges,
                roundAnalysis,
                oddsAnalysis,
                totalSuccessful: successfulPredictions.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Fonctions d'analyse (protégées côté backend)
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

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`Serveur backend démarré sur le port ${PORT}`);
    console.log(`API disponible sur: http://localhost:${PORT}/api/`);
});