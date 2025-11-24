const express = require('express');
const sql = require('./db.js');

const getAllIdeas = async (req, res) => {
    try {
        const allIdeas = await sql`
            SELECT i.id, i.title, i.description, i.solution, i.images, i.created_at, u.mail
            FROM ideas  
            JOIN users u ON i.user_id =u.id
            RETURNING id
        `;

        if(!allIdeas) return res.status(400).json({message: 'Ideas not found'});

        return res.status(200).json({message: 'succes', result: allIdeas});
    } catch(error) {
        console.error(error);
        return res.status(500).json({message: 'INternal server error'});
    }
}

const deleteIdea = async (req, res) => {
    try {
        const userId = req.params?.id;
    
        if(!userId) return res.status(400).json({message: 'UserId is required'});
        
        const idea = await sql`
            DELETE FROM ideas 
            WHERE user_id = ${userId} 
            RETURNING id
        `;

        if(!idea) return res.status(400).json({message: 'Idea not found'});

        return res.status(200).json({message: 'Idea deleted'});
    } catch (error) {
        console.error(error);
        return res.status(500).json({message: 'Internal server error'});
    }
}

const editIdeaStatus = async (req, res) => {
    try {
        const { ideaId, status }  = req.params;
        if(!ideaId || !status) return res.status(400).json({message: 'Both parameters are required'});

        const ideaStatus = await sql`
            UPDATE idea
            SET Status = ${status}
            WHERE user_id = ${ideaId}
            RETURNING id
        `;

        if(!ideaStatus) return res.status(400).json({message: 'Idea not changed'});

        return res.status(200).json({message: 'Idea updated sucessfully'});
    } catch (error) {
        console.error(error);
        return res.status(500).json({message: 'Internal server error'});
    }
}

const getIdeaDetails = async (req, res) => {
    try {
        const {userId, ideaId} = req.params;

        if(!userId || !ideaId) return res.status(403).JSON({message: 'Both parameters are required'});

        const result = await sql`
            SELECT id, title, description, solution, images
            FROM ideas
            WHERE id = ${ideaId} AND user_id = ${userId}
        `;

        if(!result) return res.status(403).json({message: 'details for idea not found'});

        return res.status(200).json({message: 'Success', details: result})

    } catch (error) {
        console.error(error);
        return res.status(500).json({message: 'Internal server error'})
    }
};

module.exports = {
    getAllIdeas,
    deleteIdea,
    editIdeaStatus,
    getIdeaDetails
};