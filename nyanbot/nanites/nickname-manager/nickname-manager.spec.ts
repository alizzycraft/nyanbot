import { Test, TestingModule } from '@nestjs/testing';
import { NicknameManagerNanite } from './nickname-manager.nanite';
import { SwarmService } from '../../swarm/swarm.service';

describe('NicknameManagerNanite', () => {
  let nanite: NicknameManagerNanite;
  let swarmService: SwarmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NicknameManagerNanite,
        {
          provide: SwarmService,
          useValue: {
            dispatch: jest.fn(),
            registerQueryHandler: jest.fn(),
            executeQuery: jest.fn().mockImplementation((queryType, payload) => {
              // Mock the persistence:getState query
              if (queryType === 'persistence:getState') {
                return Promise.resolve({});
              }
              return Promise.resolve();
            }),
          },
        },
      ],
    }).compile();

    nanite = module.get<NicknameManagerNanite>(NicknameManagerNanite);
    swarmService = module.get<SwarmService>(SwarmService);
  });

  it('should be defined', () => {
    expect(nanite).toBeDefined();
  });

  describe('updateNickname', () => {
    it('should update pronoun correctly', async () => {
      const payload = {
        userId: '123',
        guildId: '456',
        pronoun: 'He/Him',
      };

      // Mock the persistence:getState query to return empty object
      (swarmService.executeQuery as jest.Mock).mockImplementation((queryType, payload) => {
        if (queryType === 'persistence:getState') {
          return Promise.resolve({});
        }
        return Promise.resolve();
      });

      await nanite.updateNickname(payload);

      // Check that persistence:saveState was called with correct data
      expect(swarmService.dispatch).toHaveBeenCalledWith({
        type: 'persistence:saveState',
        payload: expect.objectContaining({
          key: 'nickname:123',
          data: { pronoun: 'He/Him' },
        }),
      });

      // Check that discord:setNickname was called with correct suffix
      expect(swarmService.dispatch).toHaveBeenCalledWith({
        type: 'discord:setNickname',
        payload: {
          userId: '123',
          guildId: '456',
          nickname: ' (He/Him)',
        },
      });
    }, 10000); // 10 second timeout

    it('should update politics correctly', async () => {
      const payload = {
        userId: '123',
        guildId: '456',
        politics: 'CL',
      };

      // Mock the persistence:getState query to return empty object
      (swarmService.executeQuery as jest.Mock).mockImplementation((queryType, payload) => {
        if (queryType === 'persistence:getState') {
          return Promise.resolve({});
        }
        return Promise.resolve();
      });

      await nanite.updateNickname(payload);

      // Check that persistence:saveState was called with correct data
      expect(swarmService.dispatch).toHaveBeenCalledWith({
        type: 'persistence:saveState',
        payload: expect.objectContaining({
          key: 'nickname:123',
          data: { politics: 'CL' },
        }),
      });

      // Check that discord:setNickname was called with correct suffix
      expect(swarmService.dispatch).toHaveBeenCalledWith({
        type: 'discord:setNickname',
        payload: {
          userId: '123',
          guildId: '456',
          nickname: ' [CL]',
        },
      });
    }, 10000); // 10 second timeout

    it('should build nickname suffix correctly with both pronoun and politics', async () => {
      const payload = {
        userId: '123',
        guildId: '456',
        pronoun: 'They/Them',
        politics: 'CL',
      };

      // Mock the persistence:getState query to return existing data
      (swarmService.executeQuery as jest.Mock).mockImplementation((queryType, payload) => {
        if (queryType === 'persistence:getState') {
          return Promise.resolve({ pronoun: 'They/Them', politics: 'CL' });
        }
        return Promise.resolve();
      });

      await nanite.updateNickname(payload);

      // Check that persistence:saveState was called with correct data
      expect(swarmService.dispatch).toHaveBeenCalledWith({
        type: 'persistence:saveState',
        payload: expect.objectContaining({
          key: 'nickname:123',
          data: { pronoun: 'They/Them', politics: 'CL' },
        }),
      });

      // Check that discord:setNickname was called with correct suffix
      expect(swarmService.dispatch).toHaveBeenCalledWith({
        type: 'discord:setNickname',
        payload: {
          userId: '123',
          guildId: '456',
          nickname: ' (They/Them)[CL]',
        },
      });
    }, 10000); // 10 second timeout

    it('should remove pronoun when set to undefined', async () => {
      const payload = {
        userId: '123',
        guildId: '456',
        pronoun: undefined,
        politics: 'C',
      };

      // Mock the persistence:getState query to return existing data
      (swarmService.executeQuery as jest.Mock).mockImplementation((queryType, payload) => {
        if (queryType === 'persistence:getState') {
          return Promise.resolve({ pronoun: 'He/Him', politics: 'C' });
        }
        return Promise.resolve();
      });

      await nanite.updateNickname(payload);

      // Check that persistence:saveState was called with politics only
      expect(swarmService.dispatch).toHaveBeenCalledWith({
        type: 'persistence:saveState',
        payload: expect.objectContaining({
          key: 'nickname:123',
          data: { politics: 'C' },
        }),
      });

      // Check that discord:setNickname was called with politics only
      expect(swarmService.dispatch).toHaveBeenCalledWith({
        type: 'discord:setNickname',
        payload: {
          userId: '123',
          guildId: '456',
          nickname: ' [C]',
        },
      });
    }, 10000); // 10 second timeout
  });
});