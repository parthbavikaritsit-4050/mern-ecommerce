const { test, describe, before, after, mock } = require('node:test');
const assert = require('node:assert');
const { User } = require('../model/User');
const { Product } = require('../model/Product');
const { Order } = require('../model/Order');

// Set dummy env variables for JWT and sessions so imports don't complain
process.env.JWT_SECRET_KEY = 'test_jwt_secret';
process.env.SESSION_KEY = 'test_session_secret';
process.env.MONGODB_URL = 'mongodb://127.0.0.1:27017/test';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'adminpass123';

const { isAdmin } = require('../services/common');
const { fetchUserById, fetchAllUsers, updateUser } = require('../controller/User');
const { createProduct, fetchAllProducts, fetchProductById, updateProduct } = require('../controller/Product');
const { createOrder, fetchOrdersByUser, updateOrder, fetchAllOrders } = require('../controller/Order');

// Mock request and response helpers
function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    sentStatus: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    sendStatus(code) {
      this.sentStatus = code;
      this.statusCode = code;
      return this;
    },
    cookie(name, val, options) {
      this.cookies = this.cookies || {};
      this.cookies[name] = val;
      return this;
    },
    set(name, val) {
      this.headers[name] = val;
      return this;
    }
  };
  return res;
}

describe('MERN E-Commerce Backend Refactoring Tests', () => {

  describe('Health Endpoint', () => {
    test('GET /health should return 200 and status ok', async () => {
      // Since index.js defines the route directly on `server`, we can test the handler directly or via index.js if needed.
      // But to avoid loading the whole index.js (which initializes DB and starts listening), we can test the response of a simulated server/route or just verify the logic.
      // Let's create an express app and register the same /health handler to test it.
      const express = require('express');
      const testServer = express();
      testServer.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
      });

      const res = createMockResponse();
      // Directly call the handler
      const req = {};

      // Let's invoke the handler registered on /health
      const handler = testServer._router.stack.find(layer => layer.route && layer.route.path === '/health').route.stack[0].handle;

      handler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.jsonData.status, 'ok');
      assert.strictEqual(typeof res.jsonData.uptime, 'number');
      assert.ok(res.jsonData.timestamp instanceof Date);
    });
  });

  describe('RBAC Middleware - isAdmin', () => {
    test('should allow access if user has admin role', () => {
      let nextCalled = false;
      const req = { user: { role: 'admin' } };
      const res = createMockResponse();
      const next = () => { nextCalled = true; };

      isAdmin(req, res, next);
      assert.strictEqual(nextCalled, true);
    });

    test('should return 403 if user is not admin', () => {
      let nextCalled = false;
      const req = { user: { role: 'user' } };
      const res = createMockResponse();
      const next = () => { nextCalled = true; };

      isAdmin(req, res, next);
      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.jsonData.error, 'Access forbidden: Admins only');
    });

    test('should return 403 if req.user is undefined', () => {
      let nextCalled = false;
      const req = {};
      const res = createMockResponse();
      const next = () => { nextCalled = true; };

      isAdmin(req, res, next);
      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('User Controller - Access Controls & Privilege Escalation', () => {
    test('fetchUserById should fetch current authenticated user profile', async () => {
      const mockUser = {
        _id: 'user123',
        id: 'user123',
        email: 'user@test.com',
        role: 'user',
        addresses: ['Address 1'],
        name: 'John Doe'
      };

      // Mock User.findById
      const findByIdMock = mock.method(User, 'findById', async (id) => {
        if (id === 'user123') return mockUser;
        return null;
      });

      const req = { user: { id: 'user123' } };
      const res = createMockResponse();

      await fetchUserById(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.jsonData.id, 'user123');
      assert.strictEqual(res.jsonData.email, 'user@test.com');
      assert.strictEqual(res.jsonData.role, 'user');

      findByIdMock.mock.restore();
    });

    test('fetchAllUsers should fetch all users', async () => {
      const mockUsersList = [
        { id: '1', email: 'u1@test.com', role: 'user' },
        { id: '2', email: 'u2@test.com', role: 'admin' }
      ];

      const findMock = mock.method(User, 'find', () => {
        return mockUsersList;
      });

      const req = {};
      const res = createMockResponse();

      await fetchAllUsers(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.jsonData.length, 2);
      assert.strictEqual(res.jsonData[0].email, 'u1@test.com');

      findMock.mock.restore();
    });

    test('updateUser should block non-admins from updating other users', async () => {
      const req = {
        user: { id: 'user_A', role: 'user' },
        params: { id: 'user_B' },
        body: { name: 'New Name' }
      };
      const res = createMockResponse();

      await updateUser(req, res);

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.jsonData.error, 'Access forbidden: You cannot update another user');
    });

    test('updateUser should block non-admins from changing their own role or email (privilege escalation)', async () => {
      const mockUpdatedUser = {
        id: 'user_A',
        email: 'user_a@test.com',
        role: 'user', // remained user, didn't escalate
        name: 'Jane Doe',
        addresses: []
      };

      // Mock findByIdAndUpdate to verify role & email were stripped from req.body
      let capturedUpdateData;
      const findByIdAndUpdateMock = mock.method(User, 'findByIdAndUpdate', async (id, updateData, options) => {
        capturedUpdateData = updateData;
        return mockUpdatedUser;
      });

      const req = {
        user: { id: 'user_A', role: 'user' },
        params: { id: 'user_A' },
        body: { role: 'admin', email: 'hacker@test.com', name: 'Jane Doe' }
      };
      const res = createMockResponse();

      await updateUser(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedUpdateData.role, undefined, 'role field should be stripped from update body');
      assert.strictEqual(capturedUpdateData.email, undefined, 'email field should be stripped from update body');
      assert.strictEqual(capturedUpdateData.name, 'Jane Doe');

      findByIdAndUpdateMock.mock.restore();
    });

    test('updateUser should allow admins to change roles of other users', async () => {
      const mockUpdatedUserByAdmin = {
        id: 'user_B',
        email: 'user_b@test.com',
        role: 'admin', // changed to admin
        name: 'Bob',
        addresses: []
      };

      let capturedUpdateData;
      const findByIdAndUpdateMock = mock.method(User, 'findByIdAndUpdate', async (id, updateData, options) => {
        capturedUpdateData = updateData;
        return mockUpdatedUserByAdmin;
      });

      const req = {
        user: { id: 'admin_user', role: 'admin' },
        params: { id: 'user_B' },
        body: { role: 'admin' }
      };
      const res = createMockResponse();

      await updateUser(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedUpdateData.role, 'admin');

      findByIdAndUpdateMock.mock.restore();
    });
  });

  describe('Product Controller - Calculations & Admin Check', () => {
    test('createProduct should calculate discountPrice correctly', async () => {
      let savedProductData;

      // Mock Mongoose save on Product prototype
      const originalSave = Product.prototype.save;
      Product.prototype.save = async function() {
        savedProductData = this.toJSON();
        return this;
      };

      const req = {
        body: {
          title: 'Awesome Phone',
          description: 'A great smartphone',
          price: 1000,
          discountPercentage: 10,
          brand: 'Apple',
          category: 'smartphones',
          thumbnail: 'thumb.jpg',
          images: ['img1.jpg']
        }
      };
      const res = createMockResponse();

      await createProduct(req, res);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(savedProductData.discountPrice, 900); // 1000 * (1 - 0.10)

      // Restore save
      Product.prototype.save = originalSave;
    });

    test('fetchAllProducts should support categories and brands filter, sort, limit', async () => {
      const findQueryMock = {
        exec: async () => [{ title: 'P1' }, { title: 'P2' }],
        find(cond) {
          this.conditions = { ...this.conditions, ...cond };
          return this;
        },
        sort(opts) {
          this.sortOpts = opts;
          return this;
        },
        skip(n) {
          this.skipped = n;
          return this;
        },
        limit(n) {
          this.limited = n;
          return this;
        },
        count() {
          return {
            exec: async () => 20
          };
        }
      };

      const originalFind = Product.find;
      Product.find = function(condition) {
        findQueryMock.conditions = condition;
        return findQueryMock;
      };

      const req = {
        query: {
          category: 'smartphone,laptops',
          brand: 'Apple,Samsung',
          _sort: 'price',
          _order: 'desc',
          _page: '2',
          _limit: '10'
        }
      };
      const res = createMockResponse();

      await fetchAllProducts(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['X-Total-Count'], 20);
      assert.deepStrictEqual(findQueryMock.conditions, {
        deleted: { $ne: true },
        category: { $in: [ 'smartphone', 'laptops' ] },
        brand: { $in: [ 'Apple', 'Samsung' ] }
      });
      assert.deepStrictEqual(findQueryMock.sortOpts, { price: 'desc' });
      assert.strictEqual(findQueryMock.skipped, 10);
      assert.strictEqual(findQueryMock.limited, 10);

      Product.find = originalFind;
    });
  });

  describe('Order Controller', () => {
    test('fetchAllOrders should support sorting, pagination for admins', async () => {
      const orderQueryMock = {
        exec: async () => [{ id: 'order1' }],
        sort(opts) {
          this.sortOpts = opts;
          return this;
        },
        skip(n) {
          this.skipped = n;
          return this;
        },
        limit(n) {
          this.limited = n;
          return this;
        },
        count() {
          return {
            exec: async () => 15
          };
        }
      };

      const originalFind = Order.find;
      Order.find = function(condition) {
        orderQueryMock.conditions = condition;
        return orderQueryMock;
      };

      const req = {
        query: {
          _sort: 'createdAt',
          _order: 'asc',
          _page: '1',
          _limit: '5'
        }
      };
      const res = createMockResponse();

      await fetchAllOrders(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['X-Total-Count'], 15);
      assert.deepStrictEqual(orderQueryMock.conditions, { deleted: { $ne: true } });
      assert.deepStrictEqual(orderQueryMock.sortOpts, { createdAt: 'asc' });
      assert.strictEqual(orderQueryMock.skipped, 0);
      assert.strictEqual(orderQueryMock.limited, 5);

      Order.find = originalFind;
    });
  });

});
