const express = require('express');
const { createOrder, fetchOrdersByUser, deleteOrder, updateOrder,fetchAllOrders } = require('../controller/Order');
const { isAdmin } = require('../services/common');

const router = express.Router();
//  /orders is already added in base path
router.post('/', createOrder)
      .get('/own/', fetchOrdersByUser)
      .delete('/:id', isAdmin, deleteOrder)
      .patch('/:id', isAdmin, updateOrder)
      .get('/', isAdmin, fetchAllOrders)


exports.router = router;
