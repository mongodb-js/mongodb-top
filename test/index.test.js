var top = require('../');
var es = require('event-stream');
var mongodb = require('mongodb');

describe('mongodb-top', function() {
  it('should work', function(done) {
    mongodb.connect('mongodb://localhost:27017', function(err, db) {
      if (err) {
        return done(err);
      }

      var src = top(db, {
        ms: 100
      });
      src.pipe(es.map(function(data, fn) {
        if (data.sampled_at) {
          src.end();
          done();
        }
        fn(null, data);
      }));
    });
  });
});
