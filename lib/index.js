var debug = require('debug')('mongodb-top');
var util = require('util');
var Readable = require('stream').Readable;

function Top(db, opts) {
  if (!(this instanceof Top)) return new Top(db, opts);

  opts = opts || {};
  this.db = db;
  this.prev = null;
  this.sampleCount = 0;
  this._interval = null;
  this._ms = opts.ms;
  this.first = true;

  this.computedProperties = {
    'read': ['queries', 'getmore'],
    'write': ['insert', 'update', 'remove'],
    'lock': ['readlock', 'writelock']
  };

  Readable.call(this, {objectMode: true});
}
util.inherits(Top, Readable);

Top.prototype._read = function(){
  debug('_read called');
  this.on('first sample', this.onFirstSample.bind(this));
  this.on('sample', this.onSample.bind(this));
  this.find();
  this._interval = setInterval(this.find.bind(this), this._ms);
};

Top.prototype.find = function(){
  debug('find');
  this.cursor = this.db.command({top: 1}, function(err, data) {
    if (err) {
      debug('error running top');
      return this.emit('error', err);
    }

    if (this.first) {
      this.first = false;
      return this.emit('first sample', data);
    }
    this.emit('sample', data);
  }.bind(this));
};

Top.prototype.onFirstSample = function(data) {
  var res = this.prev = this.normalize(data.totals);
  res.deltas = {};
  this.emit('data', res);
};

Top.prototype.onSample = function(data) {
  var res = this.normalize(data.totals);

  if (res.metrics.length === 0) return debug('empty instance');

  var deltas = this.calculateDeltas(res.metrics),
    changed = false,
    totals = {};

  // Filter 0's.  If you want a full list of metrics, call the rest read method.
  Object.keys(deltas).map(function(k) {
    if (deltas[k] === 0) {
      delete deltas[k];
    } else {
      changed = true;
    }
  });


  Object.keys(deltas).map(function(k) {
    var parts = k.split('.'),
      type = parts.pop(),
      name = parts.pop();
    parts.pop();

    var dbKey = parts.join('') + '.' + name + '.' + type;

    if (!deltas[dbKey]) {
      deltas[dbKey] = 0;
    }
    deltas[dbKey] += deltas[k];


    if (type === 'count') {
      if (!totals[name]) {
        totals[name] = 0;
      }
      totals[name] += deltas[k];
    }
  });

  this.emit('data', {
    namespaces: res.namespaces,
    deltas: deltas,
    totals: totals,
    sampled_at: new Date(),
    changed: changed
  });

  this.sampleCount++;

  this.prev = res;
};

Top.prototype.calculateDeltas = function(metrics) {
  var deltas = {},
    self = this;
  Object.keys(metrics).map(function(key) {
    deltas[key] = metrics[key] - (self.prev.metrics[key] || 0);
  });
  return deltas;
};

Top.prototype.compute = function(ns, res) {
  var self = this,
    summer = function(a, b) {
      return a + b;
    };

  Object.keys(this.computedProperties).map(function(name) {
    var propCount = self.computedProperties[name].length,
      counts = [],
      times = [];

    self.computedProperties[name].map(function(k) {
      counts.push(res.metrics[ns + '.' + k + '.count']);
      times.push(res.metrics[ns + '.' + k + '.time']);
    });

    res.metrics[ns + '.' + name + '.count'] = counts.reduce(summer) || 0;
    res.metrics[ns + '.' + name + '.time'] = (times.reduce(summer) / propCount) || 0;
  });
};

Top.prototype.normalize = function(data) {
  delete data[':'];
  delete data.note;

  var keys = [
      'total',
      'readLock',
      'writeLock',
      'queries',
      'getmore',
      'insert',
      'update',
      'remove',
      'commands'
    ],
    self = this,
    res = {
      time: new Date(),
      namespaces: [],
      metrics: {},
      metric_count: 0
    };

  Object.keys(data).map(function(ns) {

    var src = ns,
      dest = ns;

    if (ns === '') return;

    res.namespaces.push(dest);

    keys.map(function(k) {
      var metric = dest + '.' + k.toLowerCase();
      res.metrics[metric + '.count'] = data[src][k].count;
      res.metric_count++;
    });

    self.compute(ns, res);
  });

  res.changed = self.prev !== null && (this.prev.metrics['total.count'] !== res.metrics['total.count']);

  return res;
};

Top.prototype.end = function() {
  clearInterval(this._interval);
  if (this.cursor) {
    this.cursor.close();
  }
  this.emit('end');
  return this;
};

module.exports = Top;
