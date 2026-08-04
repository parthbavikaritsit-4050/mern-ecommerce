const { User } = require('../model/User');

exports.fetchUserById = async (req, res) => {
  const { id } = req.user;
  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({id:user.id,addresses:user.addresses,email:user.email,role:user.role, name:user.name});
  } catch (err) {
    res.status(400).json(err);
  }
};

exports.fetchAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'id email role addresses name');
    res.status(200).json(users);
  } catch (err) {
    res.status(400).json(err);
  }
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;

  // Authorization check: User can only update themselves, or must be an admin
  if (currentUser.role !== 'admin' && currentUser.id !== id) {
    return res.status(403).json({ error: 'Access forbidden: You cannot update another user' });
  }

  // Privilege escalation protection: Only admins can change roles
  const updateData = { ...req.body };
  if (currentUser.role !== 'admin') {
    delete updateData.role;
    delete updateData.email; // Also don't let regular users easily hijack email if we want to be strict
  }

  try {
    const user = await User.findByIdAndUpdate(id, updateData, { new: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({id:user.id,addresses:user.addresses,email:user.email,role:user.role, name:user.name});
  } catch (err) {
    res.status(400).json(err);
  }
};
