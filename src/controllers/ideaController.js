const express = require('express');
const sql = require('./db.js');

const createIdea = async (req, res) => {
    try {
        const {
            title,
            description,
            solution,
            images = [],
            userId
        } = req.body;

        if (!title || !description || !solution || !userId)
            return res.status(400).json({ message: 'Missing required fields' });

        const inserted = await sql`
            INSERT INTO "Ideas" (title, description, solution, images, "userId")
            VALUES (
                ${title},
                ${description},
                ${solution},
                ${JSON.stringify(images)},  
            )
            RETURNING id
        `;

        return res.status(201).json({
            message: 'Idea created successfully',
            id: inserted[0].id
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getUserIdeas = async (req, res) => {
    try {
        const userId = req.params?.id;

        if (!userId) {
            return res.status(400).json({ message: 'User id required' });
        }

        const results = await sql`
            SELECT id, title, status
            FROM "Ideas"
            WHERE user_id = ${userId}
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


module.exports = {
    createIdea,
    getUserIdeas
};