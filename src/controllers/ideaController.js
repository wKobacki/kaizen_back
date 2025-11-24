const express = require('express');
const sql = require('./db.js');

const createIdea = async (req, res) => {
    try {
        const {
            title,
            description,
            solution,
            images = [],
            userId,
            status,
            department
        } = req.body;

        if (!title || !description || !solution || !userId || !status || !department)
            return res.status(400).json({ message: 'Missing required fields' });

        const inserted = await sql`
            INSERT INTO ideas (title, description, solution, images, user_id, status, department)
            VALUES (
                ${title},
                ${description},
                ${solution},
                ${JSON.stringify(images)},
                ${userId},
                ${status},
                ${department}
            )
            RETURNING id
        `;

        if (!inserted)
            return res.status(400).json({ message: 'There was some error during adding idea' });

        return res.status(201).json({
            message: 'Idea created successfully',
            id: inserted[0].id
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getAllIdeas = async (req, res) => {
    try {
        const results = await sql`
            SELECT id, title, status, department
            FROM ideas
        `;

        if (results.length === 0) {
            return res.status(404).json({ message: 'No ideas found for this user' });
        }

        return res.status(200).json({
            message: 'Success',
            ideas: results
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getIdeaDetails = async (req, res) => {
    try {
        const ideaId = req.params?.id;

        if(!ideaId) return res.status(403).json({message: 'All parameters are required'});

        const result = await sql`
            SELECT id, title, description, solution, images, status, department
            FROM ideas
            WHERE id = ${ideaId} 
        `;

        if(!result) return res.status(403).json({message: 'details for idea not found'});

        return res.status(200).json({message: 'Success', details: result})

    } catch (error) {
        console.error(error);
        return res.status(500).json({message: 'Internal server error'})
    }
};

module.exports = {
    createIdea,
    getAllIdeas,
    getIdeaDetails
};