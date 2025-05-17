import React from 'react';

const Scoreboard = ({ graphData }) => {
    // Calculate scores for each debator
    const calculateScores = () => {
        const scores = {
            'Debator1': { agree: 0, disagree: 0 },
            'Debator2': { agree: 0, disagree: 0 }
        };

        graphData.links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            if (sourceId === 'Debator1' || sourceId === 'Debator2') {
                if (link.color === 'green') {
                    scores[sourceId].agree++;
                } else if (link.color === 'red') {
                    scores[sourceId].disagree++;
                }
            }
        });

        return scores;
    };

    const scores = calculateScores();

    const scoreboardStyle = {
        position: 'absolute',
        top: '20px',
        left: '20px',
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        minWidth: '200px'
    };

    const debatorStyle = {
        marginBottom: '15px',
        padding: '10px',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px'
    };

    const scoreStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '5px',
        fontSize: '0.9em'
    };

    const agreeStyle = {
        color: 'green',
        fontWeight: 'bold'
    };

    const disagreeStyle = {
        color: 'red',
        fontWeight: 'bold'
    };

    return (
        <div style={scoreboardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Scoreboard</h3>
            {Object.entries(scores).map(([debator, score]) => (
                <div key={debator} style={debatorStyle}>
                    <div style={{ fontWeight: 'bold' }}>{debator}</div>
                    <div style={scoreStyle}>
                        <span style={agreeStyle}>Agree: {score.agree}</span>
                        <span style={disagreeStyle}>Disagree: {score.disagree}</span>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default Scoreboard; 