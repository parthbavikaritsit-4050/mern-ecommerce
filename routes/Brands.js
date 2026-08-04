const express = require('express');
const { fetchBrands, createBrand } = require('../controller/Brand');
const { isAdmin } = require('../services/common');

const router = express.Router();
//  /brands is already added in base path
router.get('/', fetchBrands).post('/', isAdmin, createBrand);

exports.router = router;
